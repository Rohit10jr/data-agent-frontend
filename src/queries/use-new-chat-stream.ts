// Streaming hook for the home page (new-chat flow).
//
// Differences from useChatStream:
//  - No threadId yet — we POST connection_id instead.
//  - On `thread_created`, we navigate to /<thread_id> and seed the chat-history
//    cache so the chat-detail page can pick up the in-flight stream
//    without waiting for the full history refetch.

import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { streamSqlAgent, type AgentEvent } from '@/lib/django-stream';
import {
	chatHistoryQueryKey,
	type ChatHistoryResponse,
	type HistoryMessage,
	type HistoryPart,
} from '@/queries/use-chat-history-query';
import {
	CHAT_LIST_QUERY_KEY,
	type ListChatResponse,
	type ChatListItem,
} from '@/queries/use-chat-list-query';

export function useNewChatStream() {
	const qc = useQueryClient();
	const navigate = useNavigate();

	const [liveUser, setLiveUser] = useState<HistoryMessage | null>(null);
	const [liveAssistant, setLiveAssistant] = useState<HistoryMessage | null>(null);
	const [isStreaming, setIsStreaming] = useState(false);
	const [streamError, setStreamError] = useState<string | undefined>();
	const abortRef = useRef<AbortController | null>(null);
	const threadIdRef = useRef<string | null>(null);
	// Captured copy of the current user message so the `thread_created` handler
	// can seed the cache with it without depending on stale state in the closure.
	const liveUserRef = useRef<HistoryMessage | null>(null);

	const messages = useMemo<HistoryMessage[]>(() => {
		const out: HistoryMessage[] = [];
		if (liveUser) out.push(liveUser);
		if (liveAssistant) out.push(liveAssistant);
		return out;
	}, [liveUser, liveAssistant]);

	const handleEvent = useCallback(
		(event: AgentEvent) => {
			switch (event.type) {
				case 'thread_created': {
					threadIdRef.current = event.thread_id;
					// Add the new chat to the sidebar list immediately.
					qc.setQueryData<ListChatResponse>(CHAT_LIST_QUERY_KEY, (prev) => {
						if (!prev) return prev;
						const newChat: ChatListItem = {
							id: event.thread_id,
							projectId: 'default',
							title: 'New Chat',
							isStarred: false,
							createdAt: Date.now(),
							updatedAt: Date.now(),
						};
						return { ...prev, chats: [newChat, ...prev.chats] };
					});
					// Seed the chat-history cache with the user's message AND an empty
					// assistant placeholder so the detail page mounts showing both
					// bubbles immediately (the assistant bubble renders a thinking
					// indicator while we wait for tokens).
					const seedMessages: HistoryMessage[] = [];
					if (liveUserRef.current) seedMessages.push(liveUserRef.current);
					seedMessages.push({
						id: `pending-asst-${event.thread_id}`,
						role: 'assistant',
						parts: [],
						usage: null,
						created_at: null,
					});
					qc.setQueryData<ChatHistoryResponse>(
						chatHistoryQueryKey(event.thread_id),
						{ thread_id: event.thread_id, messages: seedMessages },
					);
					navigate({ to: '/$chatId', params: { chatId: event.thread_id } });
					break;
				}

				case 'token': {
					const partType: 'reasoning' | 'text' = event.kind === 'reasoning' ? 'reasoning' : 'text';
					setLiveAssistant((prev) => {
						if (!prev) return prev;
						const last = prev.parts[prev.parts.length - 1];
						if (last && last.type === partType) {
							const updated: HistoryPart = { ...last, text: last.text + event.text };
							return { ...prev, parts: [...prev.parts.slice(0, -1), updated] };
						}
						return {
							...prev,
							parts: [...prev.parts, { type: partType, text: event.text }],
						};
					});
					break;
				}

				case 'tool_start': {
					setLiveAssistant((prev) =>
						prev
							? {
									...prev,
									parts: [
										...prev.parts,
										{
											type: 'tool-call',
											tool_call_id: '',
											tool_name: event.name,
											args: event.args,
										},
									],
								}
							: prev,
					);
					break;
				}

				case 'tool_result': {
					setLiveAssistant((prev) =>
						prev
							? {
									...prev,
									parts: [
										...prev.parts,
										{
											type: 'tool-result',
											tool_call_id: '',
											tool_name: event.name,
											content: event.content,
										},
									],
								}
							: prev,
					);
					break;
				}

				case 'title': {
					qc.setQueryData<ListChatResponse>(CHAT_LIST_QUERY_KEY, (prev) => {
						if (!prev) return prev;
						return {
							...prev,
							chats: prev.chats.map((c) =>
								c.id === event.thread_id ? { ...c, title: event.title } : c,
							),
						};
					});
					break;
				}

				case 'error': {
					setStreamError(event.error);
					break;
				}

				default:
					break;
			}
		},
		[qc, navigate],
	);

	const sendMessage = useCallback(
		async (text: string, opts: { connectionId?: string; model: string }) => {
			const trimmed = text.trim();
			if (!trimmed || isStreaming) return;
			if (!opts.connectionId) {
				setStreamError('Pick a database before sending.');
				return;
			}

			setStreamError(undefined);
			threadIdRef.current = null;
			const userMessage: HistoryMessage = {
				id: `live-user-${Date.now()}`,
				role: 'user',
				parts: [{ type: 'text', text: trimmed }],
				usage: null,
				created_at: null,
			};
			liveUserRef.current = userMessage;
			setLiveUser(userMessage);
			setLiveAssistant({
				id: `live-asst-${Date.now()}`,
				role: 'assistant',
				parts: [],
				usage: null,
				created_at: null,
			});
			setIsStreaming(true);

			const controller = new AbortController();
			abortRef.current = controller;

			try {
				await streamSqlAgent({
					query: trimmed,
					connectionId: opts.connectionId,
					model: opts.model,
					signal: controller.signal,
					onEvent: handleEvent,
				});
			} catch (err) {
				if ((err as Error).name !== 'AbortError') {
					setStreamError(err instanceof Error ? err.message : String(err));
				}
			} finally {
				abortRef.current = null;
				setIsStreaming(false);

				// If we received a thread_id, hand the conversation off to the chat-detail
				// page by seeding its history cache with the parts we accumulated, then
				// invalidating so it refetches the canonical version from Django.
				const tid = threadIdRef.current;
				if (tid) {
					const messagesSnapshot: HistoryMessage[] = [];
					if (liveUser) messagesSnapshot.push(liveUser);
					if (liveAssistant) messagesSnapshot.push(liveAssistant);
					qc.setQueryData<ChatHistoryResponse>(chatHistoryQueryKey(tid), {
						thread_id: tid,
						messages: messagesSnapshot,
					});
					try {
						await qc.invalidateQueries({ queryKey: chatHistoryQueryKey(tid) });
						await qc.refetchQueries({ queryKey: chatHistoryQueryKey(tid) });
					} catch {
						// ignore — the seeded cache keeps the page populated
					}
				}
				setLiveUser(null);
				setLiveAssistant(null);
			}
		},
		[handleEvent, isStreaming, qc, liveUser, liveAssistant],
	);

	const abort = useCallback(() => abortRef.current?.abort(), []);

	return { messages, sendMessage, abort, isStreaming, streamError };
}
