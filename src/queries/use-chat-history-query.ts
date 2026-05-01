import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ── Types matching the Django formatter output ────────────────────────
export type HistoryPart =
	| { type: 'text'; text: string }
	| { type: 'reasoning'; text: string }
	| { type: 'tool-call'; tool_call_id: string; tool_name: string; args: Record<string, unknown> }
	| { type: 'tool-result'; tool_call_id: string; tool_name: string; content: string };

export interface HistoryMessage {
	id: string;
	role: 'user' | 'assistant';
	parts: HistoryPart[];
	usage: {
		input_tokens?: number;
		output_tokens?: number;
		total_tokens?: number;
	} | null;
	created_at: string | null;
}

export interface ChatHistoryResponse {
	thread_id: string | null;
	messages: HistoryMessage[];
}

export const chatHistoryQueryKey = (threadId: string) => ['chat-history', threadId] as const;

export const useChatHistoryQuery = (threadId: string | undefined) => {
	return useQuery<ChatHistoryResponse>({
		queryKey: chatHistoryQueryKey(threadId ?? ''),
		queryFn: () => api.get<ChatHistoryResponse>(`/threads/${threadId}/history/`),
		enabled: !!threadId,
	});
};
