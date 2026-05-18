// Manages the live streaming state for a chat. Consumes Django SSE events,
// builds an in-progress assistant message in memory, and merges it with the
// server-loaded history. On `done`, refetches the history so the live message
// is replaced with the canonical version from the DB.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { streamSqlAgent, type AgentEvent } from '@/lib/django-stream';
import {
	chatHistoryQueryKey,
	useChatHistoryQuery,
	type HistoryMessage,
	type HistoryPart,
} from '@/queries/use-chat-history-query';
import { CHAT_LIST_QUERY_KEY, type ListChatResponse } from '@/queries/use-chat-list-query';
import { chatActivityStore } from '@/stores/chat-activity';

interface UseChatStreamOptions {
	threadId: string;
}

export function useChatStream({ threadId }: UseChatStreamOptions) {
	const qc = useQueryClient();
	const history = useChatHistoryQuery(threadId);

	const [liveUser, setLiveUser] = useState<HistoryMessage | null>(null);
	const [liveAssistant, setLiveAssistant] = useState<HistoryMessage | null>(null);
	const [isStreaming, setIsStreaming] = useState(false);
	const [streamError, setStreamError] = useState<string | undefined>();
	const abortRef = useRef<AbortController | null>(null);

	const messages = useMemo<HistoryMessage[]>(() => {
		const base = history.data?.messages ?? [];
		const extras: HistoryMessage[] = [];
		if (liveUser) extras.push(liveUser);
		if (liveAssistant) extras.push(liveAssistant);
		return [...base, ...extras];
	}, [history.data, liveUser, liveAssistant]);

	const handleEvent = useCallback(
		(event: AgentEvent) => {
			switch (event.type) {
				case 'token': {
					const partType: 'reasoning' | 'text' = event.kind === 'reasoning' ? 'reasoning' : 'text';
					setLiveAssistant((prev) => {
						if (!prev) return prev;
						const last = prev.parts[prev.parts.length - 1];
						// Append into the current part if its type matches; otherwise start a new one.
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
					// Patch the sidebar list cache with the new title.
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

				// 'done', 'thread_created', and 'result' events are ignored here.
				// 'done' is handled in the finally block below.
				// 'thread_created' applies only to the new-chat flow (deferred).
				// 'result' is redundant with tool_start/tool_result for display.
				default:
					break;
			}
		},
		[qc],
	);

	const sendMessage = useCallback(
		// opts includes `agent` from the shared ChatComposer; ignored here because
		// existing SQL chats can only ever stream against the SQL agent.
		async (text: string, opts?: { connectionId?: string; model?: string; agent?: string }) => {
			const trimmed = text.trim();
			if (!trimmed || isStreaming) return;

			setStreamError(undefined);
			setLiveUser({
				id: `live-user-${Date.now()}`,
				role: 'user',
				parts: [{ type: 'text', text: trimmed }],
				usage: null,
				created_at: null,
			});
			setLiveAssistant({
				id: `live-asst-${Date.now()}`,
				role: 'assistant',
				parts: [],
				usage: null,
				created_at: null,
			});
			setIsStreaming(true);
			// Surface a per-thread running indicator in the sidebar.
			chatActivityStore.setRunning(threadId, true);

			const controller = new AbortController();
			abortRef.current = controller;

			try {
				await streamSqlAgent({
					query: trimmed,
					threadId,
					model: opts?.model,
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
				chatActivityStore.setRunning(threadId, false);

				// Backend always finishes producing the response (even when the
				// frontend aborts the SSE), so we always flag unread if the user
				// isn't currently on this chat — the response will be there when
				// they reopen it.
				if (window.location.pathname !== `/${threadId}`) {
					chatActivityStore.setUnread(threadId, true);
				}

				// Refetch the canonical history, then clear live state. This avoids
				// a flicker where the live message disappears before the new history
				// arrives.
				try {
					await qc.invalidateQueries({ queryKey: chatHistoryQueryKey(threadId) });
					await qc.refetchQueries({ queryKey: chatHistoryQueryKey(threadId) });
				} catch {
					// ignore — UI keeps live state if refetch fails
				}
				setLiveUser(null);
				setLiveAssistant(null);
			}
		},
		[threadId, handleEvent, isStreaming, qc],
	);

	const abort = useCallback(() => {
		abortRef.current?.abort();
	}, []);

	// Cleanup-on-unmount: if the user leaves this chat mid-stream, abort the
	// client-side SSE. The backend keeps running and persists the full response
	// regardless, so reopening the chat shows the completed turn — the finally
	// block above flags it unread for that exact reason.
	useEffect(() => {
		return () => {
			abortRef.current?.abort();
		};
	}, []);

	return {
		messages,
		sendMessage,
		abort,
		isStreaming,
		isLoading: history.isLoading,
		error: history.error,
		streamError,
	};
}
