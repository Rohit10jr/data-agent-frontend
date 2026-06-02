// Streaming hook for the schema agent. Handles both "new project" (no slug)
// and "continue project" (slug present) flows.
//
// Display state (live user/assistant text, current node label, streamed
// artifacts, error) lives in the global `schemaStreamStore` rather than this
// hook's local React state. This is critical for the new-project flow: the
// home page mounts this hook, but the first `node_start` event triggers
// `commitNavigation()` which unmounts the home page and mounts schema-viewer.
// With local state, every subsequent SSE event (node labels, errors, tokens)
// would update the dying home-page hook and never reach the viewer. With the
// store, both hook instances subscribe to the same external state and the
// viewer picks up where the home page left off.
//
// Control state (abort controller, run id, navigated flag) deliberately stays
// in per-hook refs — they're tied to the call site that initiated the stream.

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import {
	streamSchemaAgent,
	cancelRun,
	ConcurrentRunError,
	type SchemaAgentEvent,
} from '@/lib/django-stream';
import {
	SCHEMA_LIST_QUERY_KEY,
	type SchemaHistoryTurn,
	type SchemaProjectDetail,
	type SchemaProjectListItem,
	schemaProjectQueryKey,
} from '@/queries/use-schema-list-query';
import { chatActivityStore } from '@/stores/chat-activity';
import { schemaStreamStore } from '@/stores/schema-stream-store';
import type { LiveTurn, SchemaStreamState } from '@/stores/schema-stream-store';

// Re-export so existing consumers don't need to update their imports.
export type { LiveTurn, SchemaStreamState };

interface UseSchemaStreamOptions {
	slug?: string; // omit for new project; navigation happens on first content
}

export function useSchemaStream({ slug }: UseSchemaStreamOptions = {}) {
	const qc = useQueryClient();
	const navigate = useNavigate();

	// Subscribe to the singleton store. Both home page and schema-viewer use
	// this same store, so events that arrive after navigation still surface.
	const state = useSyncExternalStore(
		schemaStreamStore.subscribe,
		schemaStreamStore.getSnapshot,
		schemaStreamStore.getSnapshot,
	);

	// Per-call control state. These refs belong to whichever hook instance
	// initiated `sendMessage()` — they intentionally don't survive the
	// home-page → schema-viewer transition (the running async function keeps
	// them alive via its closure even after the host component unmounts).
	const abortRef = useRef<AbortController | null>(null);
	const slugRef = useRef<string | undefined>(slug);
	const hasNavigatedRef = useRef(false);
	const runIdRef = useRef<string | null>(null);

	const commitNavigation = useCallback(() => {
		if (hasNavigatedRef.current) return;
		const s = slugRef.current;
		if (!s) return;
		hasNavigatedRef.current = true;

		// Seed the list cache so the new project shows in the sidebar immediately.
		qc.setQueryData<SchemaProjectListItem[]>(SCHEMA_LIST_QUERY_KEY, (prev) => {
			if (!prev) return prev;
			if (prev.some((p) => p.slug === s)) return prev;
			const now = Date.now();
			const newRow: SchemaProjectListItem = {
				id: -1,
				slug: s,
				name: 'New Project',
				description: null,
				isStarred: false,
				createdAt: now,
				updatedAt: now,
			};
			return [newRow, ...prev];
		});

		navigate({ to: '/schema/$slug', params: { slug: s } });
	}, [qc, navigate]);

	const handleEvent = useCallback(
		(event: SchemaAgentEvent) => {
			switch (event.type) {
				case 'thread_created': {
					slugRef.current = event.slug;
					// Flip the sidebar running indicator for this schema project.
					chatActivityStore.setRunning(event.slug, true);
					break;
				}

				case 'run_started': {
					runIdRef.current = event.run_id;
					break;
				}

				case 'cancelled': {
					// Backend has acknowledged the cancel. The stream will close
					// next; the finally block in sendMessage handles cleanup.
					break;
				}

				case 'node_start': {
					commitNavigation();
					schemaStreamStore.patch({ currentNode: event.label });
					break;
				}

				case 'token': {
					commitNavigation();
					schemaStreamStore.appendAssistantText(event.text);
					break;
				}

				case 'result': {
					commitNavigation();
					if (event.result_type === 'SCHEMA') {
						schemaStreamStore.patch({ liveSchemaTable: event.content.schema_table });
					} else if (event.result_type === 'SQL') {
						schemaStreamStore.patch({
							liveSqlTable: event.content.sql_table || null,
							liveSqlSeed: event.content.sql_seed_data || null,
						});
					}
					break;
				}

				case 'done': {
					// Final text replaces the streamed assistant text (covers the case
					// where token streaming missed something).
					schemaStreamStore.patch({
						liveAssistant: { role: 'assistant', text: event.text },
					});
					break;
				}

				case 'title': {
					qc.setQueryData<SchemaProjectListItem[]>(SCHEMA_LIST_QUERY_KEY, (prev) =>
						prev
							? prev.map((p) => (p.slug === event.slug ? { ...p, name: event.title } : p))
							: prev,
					);
					break;
				}

				case 'error': {
					schemaStreamStore.patch({
						streamError: {
							code: event.code,
							message: event.message,
							retryable: event.retryable,
							retry_after_seconds: event.retry_after_seconds,
							run_id: event.run_id,
							node: event.node,
						},
					});
					break;
				}

				default:
					break;
			}
		},
		[commitNavigation, qc],
	);

	const sendMessage = useCallback(
		async (text: string, model?: string) => {
			const trimmed = text.trim();
			// Read straight from the store so this callback's identity stays stable
			// (no useState dep). The hook re-renders via useSyncExternalStore.
			if (!trimmed || schemaStreamStore.getSnapshot().isStreaming) return;

			// Wipe any state from a previous stream — including any prior error.
			schemaStreamStore.reset();
			schemaStreamStore.patch({
				isStreaming: true,
				liveUser: { role: 'user', text: trimmed },
			});

			hasNavigatedRef.current = !!slug; // already on /schema/<slug> if we have one
			slugRef.current = slug;
			runIdRef.current = null;

			// Refine path: slug is already known → light up the sidebar spinner now.
			// New-project path: handleEvent will flip it on `thread_created` instead.
			if (slug) chatActivityStore.setRunning(slug, true);

			const controller = new AbortController();
			abortRef.current = controller;

			try {
				await streamSchemaAgent({
					query: trimmed,
					slug,
					model,
					signal: controller.signal,
					onEvent: handleEvent,
				});
			} catch (err) {
				if (err instanceof ConcurrentRunError) {
					schemaStreamStore.patch({
						streamError: {
							code: 'BAD_REQUEST',
							message:
								'A previous response is still running. Stop it before sending a new message.',
							retryable: false,
							retry_after_seconds: null,
							run_id: err.existingRunId || null,
							node: null,
						},
					});
				} else if ((err as Error).name !== 'AbortError') {
					schemaStreamStore.patch({
						streamError: {
							code: 'INTERNAL',
							message: err instanceof Error ? err.message : String(err),
							retryable: true,
							retry_after_seconds: null,
							run_id: null,
							node: null,
						},
					});
				}
			} finally {
				abortRef.current = null;
				runIdRef.current = null;
				schemaStreamStore.patch({ isStreaming: false, currentNode: null });

				// Clear the sidebar spinner (covers both refine + new-project paths).
				const finalSlug = slugRef.current;
				if (finalSlug) chatActivityStore.setRunning(finalSlug, false);

				// Always mark unread when the user isn't on this project's URL —
				// the backend finishes the response even if the client aborts.
				if (finalSlug && window.location.pathname !== `/schema/${finalSlug}`) {
					chatActivityStore.setUnread(finalSlug, true);
				}

				// Seed the project query cache with whatever live state we have so
				// the destination page renders the new turn immediately, even
				// before the refetch returns. Snapshot is fresh because this runs
				// after the stream loop finishes writing to the store.
				if (finalSlug && hasNavigatedRef.current) {
					const snapshot = schemaStreamStore.getSnapshot();
					const seededMessages: SchemaHistoryTurn[] = [];
					if (snapshot.liveUser) {
						seededMessages.push({
							id: 0,
							role: 'user',
							text: snapshot.liveUser.text,
						});
					}
					if (snapshot.liveAssistant) {
						seededMessages.push({
							id: seededMessages.length,
							role: 'assistant',
							text: snapshot.liveAssistant.text,
						});
					}

					qc.setQueryData<SchemaProjectDetail>(
						schemaProjectQueryKey(finalSlug),
						(prev) =>
							prev
								? {
										...prev,
										schema_table: snapshot.liveSchemaTable ?? prev.schema_table,
										sql_table: snapshot.liveSqlTable ?? prev.sql_table,
										sql_seed_data: snapshot.liveSqlSeed ?? prev.sql_seed_data,
										messages:
											seededMessages.length > 0 ? seededMessages : prev.messages,
									}
								: {
										id: -1,
										slug: finalSlug,
										name: 'New Project',
										user: -1,
										schema_table: snapshot.liveSchemaTable,
										sql_table: snapshot.liveSqlTable,
										sql_seed_data: snapshot.liveSqlSeed,
										sql_edited_manually: false,
										created_at: new Date().toISOString(),
										updated_at: new Date().toISOString(),
										messages: seededMessages,
									},
					);

					// Force a refetch (not just invalidate) so the cache is hot for
					// the next visit, even though no component is currently
					// subscribed to this query on the unmounted home page.
					try {
						await qc.refetchQueries({ queryKey: schemaProjectQueryKey(finalSlug) });
						await qc.invalidateQueries({ queryKey: SCHEMA_LIST_QUERY_KEY });
					} catch {
						// ignore — the seeded cache keeps the page populated
					}
				}

				// Live turn data is now reflected in the persisted project query —
				// clear the store so future renders read from the query cache,
				// not the stale live state. `streamError` is intentionally left
				// in place; consumers need it to show the retry banner.
				schemaStreamStore.patch({
					liveUser: null,
					liveAssistant: null,
					liveSchemaTable: null,
					liveSqlTable: null,
					liveSqlSeed: null,
				});
			}
		},
		[slug, handleEvent, qc],
	);

	const abort = useCallback(() => {
		// Tell the backend to stop (saves tokens + ends the run cleanly).
		const runId = runIdRef.current;
		if (runId) void cancelRun(runId);
		abortRef.current?.abort();
	}, []);

	// Cleanup-on-unmount — only when slug was provided at hook init (refine
	// case). For the new-project flow (no slug), the home page mounts the hook
	// and then unmounts on navigation to /schema/<slug>; aborting there would
	// kill the stream the user explicitly wants to continue.
	useEffect(() => {
		if (!slug) return;
		return () => {
			abortRef.current?.abort();
		};
	}, [slug]);

	return {
		...state,
		sendMessage,
		abort,
	};
}

/**
 * Helper to merge persisted history with the live in-progress turn for rendering.
 *
 * Dedupes the live user/assistant turn against history's tail. The Django
 * backend persists the user message at the start of the stream, so once the
 * project query fetches (right after navigation in the new-project flow) the
 * tail of `historyTurns` already contains it. Pushing the live turn on top
 * without this guard renders the same message twice. The same guard covers
 * the assistant turn in case a post-stream refetch lands before the store's
 * live state is cleared.
 */
export function mergeHistoryWithLive(
	historyTurns: SchemaHistoryTurn[] | undefined,
	live: SchemaStreamState,
): SchemaHistoryTurn[] {
	const turns: SchemaHistoryTurn[] = [...(historyTurns ?? [])];

	if (live.liveUser) {
		const tail = turns[turns.length - 1];
		const alreadyPersisted = tail?.role === 'user' && tail.text === live.liveUser.text;
		if (!alreadyPersisted) {
			turns.push({ id: turns.length, role: 'user', text: live.liveUser.text });
		}
	}

	if (live.liveAssistant) {
		const tail = turns[turns.length - 1];
		const alreadyPersisted =
			tail?.role === 'assistant' && tail.text === live.liveAssistant.text;
		if (!alreadyPersisted) {
			turns.push({ id: turns.length, role: 'assistant', text: live.liveAssistant.text });
		}
	}

	return turns;
}

/** Read the most-recent schema/SQL/seed: live first, then persisted. */
export function pickLatestArtifacts(
	project: SchemaProjectDetail | undefined,
	live: SchemaStreamState,
) {
	return {
		schemaTable: live.liveSchemaTable ?? project?.schema_table ?? null,
		sqlTable: live.liveSqlTable ?? project?.sql_table ?? null,
		sqlSeedData: live.liveSqlSeed ?? project?.sql_seed_data ?? null,
	};
}
