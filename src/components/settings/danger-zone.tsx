import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { SettingsCard } from '@/components/ui/settings-card';
import { api, ApiError } from '@/lib/api';
import { CHAT_LIST_QUERY_KEY, type ListChatResponse } from '@/queries/use-chat-list-query';

export function DangerZone() {
	const [isOpen, setIsOpen] = useState(false);
	const navigate = useNavigate();
	const qc = useQueryClient();

	// DELETE /api/threads/non-starred/  →  { count: N }
	// Wipes every non-starred chat the caller owns. After success, drop the
	// non-starred entries from the cached chat list and route home — the user
	// may have been viewing one of the chats that just got deleted.
	const deleteAllNonStarred = useMutation({
		mutationFn: () => api.delete<{ count: number }>('/threads/non-starred/'),
		onSuccess: () => {
			qc.setQueryData<ListChatResponse>(CHAT_LIST_QUERY_KEY, (prev) => {
				if (!prev) return prev;
				return { ...prev, chats: prev.chats.filter((c) => c.isStarred) };
			});
			setIsOpen(false);
			navigate({ to: '/' });
		},
		onError: (err) => {
			const message = err instanceof ApiError ? err.message : 'Failed to delete chats';
			alert(message);
		},
	});

	return (
		<>
			<SettingsCard title='Danger Zone'>
				<div className='flex items-center justify-between gap-4'>
					<div className='space-y-0.5'>
						<p className='text-sm font-medium'>Delete all chats</p>
						<p className='text-xs text-muted-foreground'>
							Permanently delete all your non-starred conversations. Starred chats will be kept.
						</p>
					</div>
					<Button variant='destructive' size='sm' onClick={() => setIsOpen(true)}>
						Delete all
					</Button>
				</div>
			</SettingsCard>

			<AlertDialog open={isOpen} onOpenChange={setIsOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete all non-starred chats?</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently delete all your conversations that are not starred. This action cannot
							be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant='destructive'
							isLoading={deleteAllNonStarred.isPending}
							onClick={(e) => {
								e.preventDefault();
								deleteAllNonStarred.mutate();
							}}
						>
							Delete all
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
