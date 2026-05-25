// Streaming hook for the schema agent. Handles both "new project" (no slug)
// and "continue project" (slug present) flows. Maintains live state for the
// current turn — running node label, in-progress assistant text,
// latest-known schema/sql/seed — and merges them with the persisted project
// data on completion.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export interface LiveTurn {
	role: 'user' | 'assistant';
	text: string;
}

export interface SchemaStreamState {
	liveUser: LiveTurn | null;
	liveAssistant: LiveTurn | null;
	currentNode: string | null;       // label of the node currently executing
	liveSchemaTable: string | null;   // streamed schema JSON (may arrive mid-turn)
	liveSqlTable: string | null;
	liveSqlSeed: string | null;
	isStreaming: boolean;
	streamError?: string;
}

interface UseSchemaStreamOptions {
	slug?: string;   // omit for new project; navigation happens on first content
}

export function useSchemaStream({ slug }: UseSchemaStreamOptions = {}) {
	const qc = useQueryClient();
	const navigate = useNavigate();

	const [liveUser, setLiveUser] = useState<LiveTurn | null>(null);
	const [liveAssistant, setLiveAssistant] = useState<LiveTurn | null>(null);
	const [currentNode, setCurrentNode] = useState<string | null>(null);
	const [liveSchemaTable, setLiveSchemaTable] = useState<string | null>(null);
	const [liveSqlTable, setLiveSqlTable] = useState<string | null>(null);
	const [liveSqlSeed, setLiveSqlSeed] = useState<string | null>(null);
	const [isStreaming, setIsStreaming] = useState(false);
	const [streamError, setStreamError] = useState<string | undefined>();

	const abortRef = useRef<AbortController | null>(null);
	const slugRef = useRef<string | undefined>(slug);
	const hasNavigatedRef = useRef(false);
	// run_id captured from the `run_started` SSE event — drives abort()'s
	// POST /api/runs/<run_id>/cancel/ so the backend actually stops generating.
	const runIdRef = useRef<string | null>(null);
	// Refs shadow the state above so the `finally` block sees the latest
	// values even if its closure was created when state was still null
	// (stale-closure trap with async functions + useCallback).
	const liveUserRef = useRef<LiveTurn | null>(null);
	const liveAssistantRef = useRef<LiveTurn | null>(null);
	const liveSchemaTableRef = useRef<string | null>(null);
	const liveSqlTableRef = useRef<string | null>(null);
	const liveSqlSeedRef = useRef<string | null>(null);

	// Mirror state into refs every render so async closures (the `finally`
	// block below) read the latest values, not the values frozen when the
	// closure was created.
	useEffect(() => {
		liveUserRef.current = liveUser;
		liveAssistantRef.current = liveAssistant;
		liveSchemaTableRef.current = liveSchemaTable;
		liveSqlTableRef.current = liveSqlTable;
		liveSqlSeedRef.current = liveSqlSeed;
	});

	const liveState = useMemo<SchemaStreamState>(
		() => ({
			liveUser,
			liveAssistant,
			currentNode,
			liveSchemaTable,
			liveSqlTable,
			liveSqlSeed,
			isStreaming,
			streamError,
		}),
		[
			liveUser,
			liveAssistant,
			currentNode,
			liveSchemaTable,
			liveSqlTable,
			liveSqlSeed,
			isStreaming,
			streamError,
		],
	);

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
					setCurrentNode(event.label);
					break;
				}

				case 'token': {
					commitNavigation();
					setLiveAssistant((prev) => ({
						role: 'assistant',
						text: (prev?.text ?? '') + event.text,
					}));
					break;
				}

				case 'result': {
					commitNavigation();
					if (event.result_type === 'SCHEMA') {
						setLiveSchemaTable(event.content.schema_table);
					} else if (event.result_type === 'SQL') {
						setLiveSqlTable(event.content.sql_table || null);
						setLiveSqlSeed(event.content.sql_seed_data || null);
					}
					break;
				}

				case 'done': {
					// Final text replaces the streamed assistant text (covers the case
					// where token streaming missed something).
					setLiveAssistant({ role: 'assistant', text: event.text });
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
					setStreamError(event.error);
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
			if (!trimmed || isStreaming) return;

			setStreamError(undefined);
			hasNavigatedRef.current = !!slug; // already on /schema/<slug> if we have one
			slugRef.current = slug;

			setLiveUser({ role: 'user', text: trimmed });
			setLiveAssistant(null);
			setCurrentNode(null);
			setLiveSchemaTable(null);
			setLiveSqlTable(null);
			setLiveSqlSeed(null);
			setIsStreaming(true);
			// Refine path: slug is already known → light up the sidebar spinner now.
			// New-project path: handleEvent will flip it on `thread_created` instead.
			if (slug) chatActivityStore.setRunning(slug, true);

			runIdRef.current = null;
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
					setStreamError(
						'A previous response is still running. Stop it before sending a new message.',
					);
				} else if ((err as Error).name !== 'AbortError') {
					setStreamError(err instanceof Error ? err.message : String(err));
				}
			} finally {
				abortRef.current = null;
				runIdRef.current = null;
				setIsStreaming(false);
				setCurrentNode(null);

				// Clear the sidebar spinner (covers both refine + new-project paths).
				const finalSlug = slugRef.current;
				if (finalSlug) chatActivityStore.setRunning(finalSlug, false);

				// Always mark unread when the user isn't on this project's URL —
				// the backend finishes the response even if the client aborts.
				if (finalSlug && window.location.pathname !== `/schema/${finalSlug}`) {
					chatActivityStore.setUnread(finalSlug, true);
				}

				// Seed the project query cache with whatever live state we have,
				// so when the user clicks the sidebar dot and lands on
				// /schema/<slug> they see their question + reply immediately —
				// even if the backend refetch hasn't returned yet. Uses refs to
				// avoid the stale-closure trap.
				if (finalSlug && hasNavigatedRef.current) {
					const seededMessages: SchemaHistoryTurn[] = [];
					if (liveUserRef.current) {
						seededMessages.push({
							id: 0,
							role: 'user',
							text: liveUserRef.current.text,
						});
					}
					if (liveAssistantRef.current) {
						seededMessages.push({
							id: seededMessages.length,
							role: 'assistant',
							text: liveAssistantRef.current.text,
						});
					}

					qc.setQueryData<SchemaProjectDetail>(
						schemaProjectQueryKey(finalSlug),
						(prev) =>
							prev
								? {
										...prev,
										schema_table:
											liveSchemaTableRef.current ?? prev.schema_table,
										sql_table: liveSqlTableRef.current ?? prev.sql_table,
										sql_seed_data:
											liveSqlSeedRef.current ?? prev.sql_seed_data,
										messages:
											seededMessages.length > 0
												? seededMessages
												: prev.messages,
									}
								: {
										id: -1,
										slug: finalSlug,
										name: 'New Project',
										user: -1,
										schema_table: liveSchemaTableRef.current,
										sql_table: liveSqlTableRef.current,
										sql_seed_data: liveSqlSeedRef.current,
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
				setLiveUser(null);
				setLiveAssistant(null);
				setLiveSchemaTable(null);
				setLiveSqlTable(null);
				setLiveSqlSeed(null);
			}
		},
		[slug, isStreaming, handleEvent, qc],
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
		...liveState,
		sendMessage,
		abort,
	};
}

/** Helper to merge persisted history with the live in-progress turn for rendering. */
export function mergeHistoryWithLive(
	historyTurns: SchemaHistoryTurn[] | undefined,
	live: SchemaStreamState,
): SchemaHistoryTurn[] {
	const turns: SchemaHistoryTurn[] = [...(historyTurns ?? [])];
	if (live.liveUser) {
		turns.push({ id: turns.length, role: 'user', text: live.liveUser.text });
	}
	if (live.liveAssistant) {
		turns.push({ id: turns.length, role: 'assistant', text: live.liveAssistant.text });
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
