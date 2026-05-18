// Streaming hook for the home page (new-chat flow).
//
// Differences from useChatStream:
//  - No threadId yet — we POST connection_id instead.
//  - `thread_created` only stashes the thread id. We defer navigation until the
//    first real content event (token / tool_start / tool_result) so a failed
//    first turn — which the backend cleans up by deleting the empty
//    ChatSession — leaves the user on home rather than a dangling detail URL.

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
import { chatActivityStore } from '@/stores/chat-activity';

export function useNewChatStream() {
	const qc = useQueryClient();
	const navigate = useNavigate();

	const [liveUser, setLiveUser] = useState<HistoryMessage | null>(null);
	const [liveAssistant, setLiveAssistant] = useState<HistoryMessage | null>(null);
	const [isStreaming, setIsStreaming] = useState(false);
	const [streamError, setStreamError] = useState<string | undefined>();
	const abortRef = useRef<AbortController | null>(null);
	const threadIdRef = useRef<string | null>(null);
	// Captured copy of the current user message so the navigation handler
	// can seed the cache with it without depending on stale state in the closure.
	const liveUserRef = useRef<HistoryMessage | null>(null);
	// Whether we've already navigated to /<thread_id>. We defer navigation until
	// the agent emits its first real event so a failed first turn (where the
	// backend deletes the empty ChatSession) leaves the user on home, not on
	// a now-404 detail URL.
	const hasNavigatedRef = useRef(false);

	const messages = useMemo<HistoryMessage[]>(() => {
		const out: HistoryMessage[] = [];
		if (liveUser) out.push(liveUser);
		if (liveAssistant) out.push(liveAssistant);
		return out;
	}, [liveUser, liveAssistant]);

	// Hand off to the chat-detail page once the agent has emitted real content.
	// Before this point we keep the user on home so a failed first turn (cleaned
	// up server-side) doesn't leave them on a dangling /<thread_id> URL.
	const commitNavigation = useCallback(() => {
		if (hasNavigatedRef.current) return;
		const tid = threadIdRef.current;
		if (!tid) return;
		hasNavigatedRef.current = true;

		qc.setQueryData<ListChatResponse>(CHAT_LIST_QUERY_KEY, (prev) => {
			if (!prev) return prev;
			if (prev.chats.some((c) => c.id === tid)) return prev;
			const newChat: ChatListItem = {
				id: tid,
				projectId: 'default',
				title: 'New Chat',
				isStarred: false,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};
			return { ...prev, chats: [newChat, ...prev.chats] };
		});

		const seedMessages: HistoryMessage[] = [];
		if (liveUserRef.current) seedMessages.push(liveUserRef.current);
		seedMessages.push({
			id: `pending-asst-${tid}`,
			role: 'assistant',
			parts: [],
			usage: null,
			created_at: null,
		});
		qc.setQueryData<ChatHistoryResponse>(chatHistoryQueryKey(tid), {
			thread_id: tid,
			messages: seedMessages,
		});
		navigate({ to: '/$chatId', params: { chatId: tid } });
	}, [qc, navigate]);

	const handleEvent = useCallback(
		(event: AgentEvent) => {
			switch (event.type) {
				case 'thread_created': {
					// Stash the thread id but defer navigation until first content.
					threadIdRef.current = event.thread_id;
					// Flip the sidebar running indicator now that we have an id.
					chatActivityStore.setRunning(event.thread_id, true);
					break;
				}

				case 'token': {
					commitNavigation();
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
					commitNavigation();
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
					commitNavigation();
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
		[qc, navigate, commitNavigation],
	);

	const sendMessage = useCallback(
		// opts includes `agent` from the shared ChatComposer; the home page is
		// responsible for routing 'schema' messages to a different hook before
		// this one is called, so we only handle the SQL case here.
		async (text: string, opts: { connectionId?: string; model: string; agent?: string }) => {
			const trimmed = text.trim();
			if (!trimmed || isStreaming) return;
			if (!opts.connectionId) {
				setStreamError('Pick a database before sending.');
				return;
			}

			setStreamError(undefined);
			threadIdRef.current = null;
			hasNavigatedRef.current = false;
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

				// Clear the sidebar spinner for this thread (set on thread_created).
				const tid = threadIdRef.current;
				if (tid) chatActivityStore.setRunning(tid, false);

				// Always mark unread when the user isn't on the new thread's URL —
				// the backend finishes the response even if the client aborts.
				if (tid && window.location.pathname !== `/${tid}`) {
					chatActivityStore.setUnread(tid, true);
				}

				// Only hand off the cache if we actually navigated to the detail page.
				// If the run failed before any content arrived, the backend has deleted
				// the empty ChatSession and the user is still on home — no cache to seed.
				if (tid && hasNavigatedRef.current) {
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
