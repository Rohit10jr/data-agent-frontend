import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// nao's ChatListItem shape — what the sidebar components expect.
export interface ChatListItem {
	id: string;
	projectId: string;
	title: string;
	isStarred: boolean;
	createdAt: number;
	updatedAt: number;
}

export interface ListChatResponse {
	chats: ChatListItem[];
}

// Django's GET /api/threads/ response: array of { thread_id, title }
interface DjangoThread {
	thread_id: string;
	title: string | null;
	created_at?: string;
}

export const CHAT_LIST_QUERY_KEY = ['chats', 'list'] as const;

const adaptThread = (t: DjangoThread): ChatListItem => {
	const created = t.created_at ? new Date(t.created_at).getTime() : Date.now();
	return {
		id: t.thread_id,
		projectId: 'default', // Django has no project concept — synthetic
		title: t.title ?? 'New Conversation',
		isStarred: false, // Django doesn't track this yet
		createdAt: created,
		updatedAt: created,
	};
};

export const useChatListQuery = () => {
	return useQuery<ListChatResponse>({
		queryKey: CHAT_LIST_QUERY_KEY,
		queryFn: async () => {
			const threads = await api.get<DjangoThread[]>('/threads/');
			return { chats: threads.map(adaptThread) };
		},
	});
};

/**
 * Imperative cache setter — used for optimistic updates (rename, delete,
 * new-chat-from-stream prepend).
 */
export const useSetChatList = () => {
	const qc = useQueryClient();
	return (
		updater:
			| ListChatResponse
			| ((prev: ListChatResponse | undefined) => ListChatResponse | undefined),
	) => {
		qc.setQueryData<ListChatResponse>(CHAT_LIST_QUERY_KEY, updater as never);
	};
};
