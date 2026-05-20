// Chat search — calls the Django full-text search endpoint and adapts the
// snake_case response into a camelCase shape the command menu consumes.
// Covers both SQL chats and schema projects; `agent` says which.

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ChatSearchResult {
	agent: 'sql' | 'schema';
	/** ChatSession.thread_id for sql, SchemaProject.slug for schema */
	threadId: string;
	title: string;
	/** snippet around the content match, or null for title-only matches */
	matchedText: string | null;
	rank: number;
}

interface DjangoSearchResult {
	agent: 'sql' | 'schema';
	thread_id: string;
	title: string;
	matched_text: string | null;
	rank: number;
}

const adapt = (r: DjangoSearchResult): ChatSearchResult => ({
	agent: r.agent,
	threadId: r.thread_id,
	title: r.title,
	matchedText: r.matched_text,
	rank: r.rank,
});

export const useSearchChatsQuery = (query: string, options?: { enabled?: boolean }) => {
	return useQuery<ChatSearchResult[]>({
		queryKey: ['chat-search', query],
		queryFn: async () => {
			const res = await api.get<{ results: DjangoSearchResult[] }>(
				`/search/?q=${encodeURIComponent(query)}`,
			);
			return res.results.map(adapt);
		},
		enabled: query.length >= 2 && (options?.enabled ?? true),
	});
};
