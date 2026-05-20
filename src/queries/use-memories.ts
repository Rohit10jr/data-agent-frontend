// Long-term memory queries — list / create / update / delete the memories the
// agent has learned about the user. Backed by the Django /api/memories/ API.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Memory {
	id: string;
	content: string;
	category: string;
	source: 'agent' | 'user';
	created_at?: string;
	updated_at?: string;
}

export const MEMORIES_QUERY_KEY = ['memories'] as const;

export function useMemoriesQuery() {
	return useQuery<Memory[]>({
		queryKey: MEMORIES_QUERY_KEY,
		queryFn: async () => {
			const res = await api.get<{ memories: Memory[] }>('/memories/');
			return res.memories;
		},
	});
}

export function useMemoryMutations() {
	const qc = useQueryClient();
	const invalidate = () => qc.invalidateQueries({ queryKey: MEMORIES_QUERY_KEY });

	const createMutation = useMutation({
		mutationFn: (vars: { content: string; category?: string }) =>
			api.post<{ memory: Memory }>('/memories/', vars),
		onSuccess: invalidate,
	});

	const updateMutation = useMutation({
		mutationFn: (vars: { memoryId: string; content: string }) =>
			api.patch<{ memory: Memory }>(`/memories/${vars.memoryId}/`, {
				content: vars.content,
			}),
		onSuccess: invalidate,
	});

	const deleteMutation = useMutation({
		mutationFn: (vars: { memoryId: string }) =>
			api.delete<void>(`/memories/${vars.memoryId}/`),
		onSuccess: invalidate,
	});

	return { createMutation, updateMutation, deleteMutation };
}
