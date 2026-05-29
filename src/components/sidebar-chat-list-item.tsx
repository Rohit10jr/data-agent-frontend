import { Ellipsis, Pencil, Star, StarOff, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Link } from './ui/link';
import {
	DropdownMenu,
	DropdownMenuItem,
	DropdownMenuGroup,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { InputEdit } from './ui/input-edit';
import { Spinner } from './ui/spinner';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from './ui/alert-dialog';
import type { ComponentProps } from 'react';

import type { ChatListItem } from '@/queries/use-chat-list-query';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTimeAgo } from '@/hooks/use-time-ago';
import { useChatActivity } from '@/hooks/use-chat-activity';
import { api, ApiError } from '@/lib/api';
import { CHAT_LIST_QUERY_KEY, type ListChatResponse } from '@/queries/use-chat-list-query';

export interface Props extends Omit<ComponentProps<'div'>, 'children'> {
	chat: ChatListItem;
}

export function ChatListItem({ chat }: Props) {
	const navigate = useNavigate();
	const qc = useQueryClient();
	const timeAgo = useTimeAgo(chat.createdAt);
	const activity = useChatActivity(chat.id);
	const [title, setTitle] = useState(chat.title);
	const [isRenaming, setIsRenaming] = useState(false);
	const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

	// DELETE /api/threads/<thread_id>/  → removes the chat row.
	const deleteChat = useMutation({
		mutationFn: (chatId: string) => api.delete<void>(`/threads/${chatId}/`),
		onSuccess: (_data, chatId) => {
			navigate({ to: '/' });
			qc.setQueryData<ListChatResponse>(CHAT_LIST_QUERY_KEY, (prev) => {
				if (!prev) return prev;
				return { ...prev, chats: prev.chats.filter((c) => c.id !== chatId) };
			});
		},
		onError: (err) => {
			const message = err instanceof ApiError ? err.message : 'Failed to delete chat';
			alert(message);
		},
	});

	// PATCH /api/threads/<thread_id>/  { title }  → renames the chat.
	const renameChat = useMutation({
		mutationFn: (vars: { chatId: string; title: string }) =>
			api.patch<{ thread_id: string; title: string }>(`/threads/${vars.chatId}/`, { title: vars.title }),
		onSuccess: (_data, vars) => {
			qc.setQueryData<ListChatResponse>(CHAT_LIST_QUERY_KEY, (prev) => {
				if (!prev) return prev;
				return {
					...prev,
					chats: prev.chats.map((c) => (c.id === vars.chatId ? { ...c, title: vars.title } : c)),
				};
			});
		},
		onError: (err) => {
			const message = err instanceof ApiError ? err.message : 'Failed to rename chat';
			alert(message);
		},
		onSettled: () => {
			setIsRenaming(false);
		},
	});

	// PATCH /api/threads/<thread_id>/  { is_starred }  → toggle starred state.
	// Optimistic: flip the flag in the cached list immediately so the sidebar
	// section moves the chat between Starred/Chats without waiting for the API.
	const toggleStar = useMutation({
		mutationFn: (vars: { chatId: string; isStarred: boolean }) =>
			api.patch<{ thread_id: string; is_starred: boolean }>(`/threads/${vars.chatId}/`, {
				is_starred: vars.isStarred,
			}),
		onMutate: (vars) => {
			const previous = qc.getQueryData<ListChatResponse>(CHAT_LIST_QUERY_KEY);
			qc.setQueryData<ListChatResponse>(CHAT_LIST_QUERY_KEY, (prev) => {
				if (!prev) return prev;
				return {
					...prev,
					chats: prev.chats.map((c) =>
						c.id === vars.chatId ? { ...c, isStarred: vars.isStarred } : c,
					),
				};
			});
			return { previous };
		},
		onError: (err, _vars, context) => {
			if (context?.previous) {
				qc.setQueryData(CHAT_LIST_QUERY_KEY, context.previous);
			}
			const message = err instanceof ApiError ? err.message : 'Failed to update star';
			alert(message);
		},
		onSettled: () => {
			qc.invalidateQueries({ queryKey: CHAT_LIST_QUERY_KEY });
		},
	});

	const handleTitleRenameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setTitle(e.target.value);
	};

	const handleTitleRenameSubmit = async () => {
		if (title.trim() && title !== chat.title) {
			await renameChat.mutateAsync({ chatId: chat.id, title: title.trim() });
		} else {
			setIsRenaming(false);
		}
	};

	const handleTitleRenameEscape = () => {
		setTitle(chat.title);
		setIsRenaming(false);
	};

	const handleRenameSelect = () => {
		setIsRenaming(!isRenaming);
	};

	const handleStarSelect = () => {
		toggleStar.mutate({ chatId: chat.id, isStarred: !chat.isStarred });
	};

	const handleDeleteSelect = () => {
		setConfirmDeleteOpen(true);
	};

	const handleDoubleClick = () => {
		setIsRenaming(true);
	};

	return (
		<Link
			params={{ chatId: chat.id }}
			to={`/$chatId`}
			className={cn(
				'group relative w-full rounded-md px-3 py-2 transition-[background-color,padding,opacity] min-w-0 flex-1 flex gap-2 items-center',
				!isRenaming && 'hover:pr-9 has-data-[state=open]:pr-9',
			)}
			inactiveProps={{
				className: cn('text-sidebar-foreground hover:bg-sidebar-accent opacity-75'),
			}}
			activeProps={{
				className: cn('text-foreground bg-sidebar-accent font-medium'),
			}}
			onDoubleClick={handleDoubleClick}
		>
			{isRenaming ? (
				<InputEdit
					value={title}
					onChange={handleTitleRenameChange}
					onSubmit={handleTitleRenameSubmit}
					onEscape={handleTitleRenameEscape}
					disabled={renameChat.isPending}
				/>
			) : (
				<>
					{activity.unread && <span className='size-1.5 shrink-0 rounded-full bg-primary' />}
					<div className='truncate text-sm mr-auto'>{chat.title}</div>
					{activity.running ? (
						<Spinner className='size-3.5 shrink-0' />
					) : (
						<div className='text-xs text-muted-foreground whitespace-nowrap'>{timeAgo.humanReadable}</div>
					)}

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant='ghost'
								size='icon-xs'
								className='absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100'
							>
								<Ellipsis />
							</Button>
						</DropdownMenuTrigger>

						<DropdownMenuContent onClick={(e) => e.stopPropagation()}>
							<DropdownMenuGroup>
								<DropdownMenuItem onSelect={handleStarSelect}>
									{chat.isStarred ? <StarOff /> : <Star />}
									{chat.isStarred ? 'Unstar' : 'Star'}
								</DropdownMenuItem>
								<DropdownMenuItem onSelect={handleRenameSelect}>
									<Pencil />
									Rename
								</DropdownMenuItem>
								<DropdownMenuItem variant='destructive' onSelect={handleDeleteSelect}>
									<TrashIcon />
									Delete
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>

					<AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
						<AlertDialogContent onClick={(e) => e.stopPropagation()}>
							<AlertDialogHeader>
								<AlertDialogTitle>Delete chat?</AlertDialogTitle>
								<AlertDialogDescription>
									Delete chat &ldquo;{chat.title}&rdquo;? This cannot be undone.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction
									variant='destructive'
									onClick={() => deleteChat.mutate(chat.id)}
								>
									Delete
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</>
			)}
		</Link>
	);
}
