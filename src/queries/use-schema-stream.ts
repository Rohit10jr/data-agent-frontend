// Streaming hook for the schema agent. Handles both "new project" (no slug)
// and "continue project" (slug present) flows. Maintains live state for the
// current turn — running node label, in-progress assistant text,
// latest-known schema/sql/seed — and merges them with the persisted project
// data on completion.

import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import {
	streamSchemaAgent,
	type SchemaAgentEvent,
} from '@/lib/django-stream';
import {
	SCHEMA_LIST_QUERY_KEY,
	type SchemaHistoryTurn,
	type SchemaProjectDetail,
	type SchemaProjectListItem,
	schemaProjectQueryKey,
} from '@/queries/use-schema-list-query';

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
				if ((err as Error).name !== 'AbortError') {
					setStreamError(err instanceof Error ? err.message : String(err));
				}
			} finally {
				abortRef.current = null;
				setIsStreaming(false);
				setCurrentNode(null);

				// Refetch the canonical project so the UI shows the persisted state.
				const finalSlug = slugRef.current;
				if (finalSlug && hasNavigatedRef.current) {
					try {
						await qc.invalidateQueries({ queryKey: schemaProjectQueryKey(finalSlug) });
						await qc.invalidateQueries({ queryKey: SCHEMA_LIST_QUERY_KEY });
					} catch {
						// ignore — live state still reflects the latest stream output
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

	const abort = useCallback(() => abortRef.current?.abort(), []);

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
