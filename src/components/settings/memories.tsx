import { useState } from 'react';
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty } from '@/components/ui/empty';
import { ErrorMessage } from '@/components/ui/error-message';
import { SettingsCard } from '@/components/ui/settings-card';
import { Textarea } from '@/components/ui/textarea';
import { SettingsMemoryItem, SettingsMemorySkeleton } from '@/components/settings/memory-item';
import { useMemoriesQuery, useMemoryMutations, type Memory } from '@/queries/use-memories';

export function SettingsMemories() {
	const { data: memories, isLoading } = useMemoriesQuery();
	const { createMutation, updateMutation, deleteMutation } = useMemoryMutations();

	const [draft, setDraft] = useState('');
	const [editMemory, setEditMemory] = useState<Memory | null>(null);
	const [editContent, setEditContent] = useState('');
	const [deleteTarget, setDeleteTarget] = useState<Memory | null>(null);

	const errorMessage = (e: unknown): string =>
		e instanceof Error ? e.message : 'Something went wrong.';

	const handleAdd = async () => {
		const content = draft.trim();
		if (!content) {
			return;
		}
		await createMutation.mutateAsync({ content });
		setDraft('');
	};

	const handleEdit = (memory: Memory) => {
		setEditMemory(memory);
		setEditContent(memory.content);
	};

	const handleSaveEdit = async () => {
		if (!editMemory) {
			return;
		}
		await updateMutation.mutateAsync({ memoryId: editMemory.id, content: editContent });
		setEditMemory(null);
	};

	const handleConfirmDelete = async () => {
		if (!deleteTarget) {
			return;
		}
		await deleteMutation.mutateAsync({ memoryId: deleteTarget.id });
		setDeleteTarget(null);
	};

	return (
		<>
			<SettingsCard
				title='Memory'
				titleSize='lg'
				description='What the assistant remembers about you across conversations. It learns as you chat — add, edit, or remove anything here.'
				divide
			>
				<div className='space-y-2'>
					<Textarea
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						placeholder='Add something you want the assistant to remember…'
						rows={2}
					/>
					{createMutation.error && <ErrorMessage message={errorMessage(createMutation.error)} />}
					<div className='flex justify-end'>
						<Button
							size='sm'
							onClick={handleAdd}
							disabled={createMutation.isPending || draft.trim().length === 0}
						>
							Add memory
						</Button>
					</div>
				</div>

				{isLoading ? (
					<div className='flex flex-col divide-y'>
						<SettingsMemorySkeleton className='pt-0' />
						<SettingsMemorySkeleton />
						<SettingsMemorySkeleton className='pb-0' />
					</div>
				) : !memories?.length ? (
					<Empty>No memories yet. The assistant will learn as you chat.</Empty>
				) : (
					<div className='flex flex-col divide-y'>
						{memories.map((memory) => (
							<SettingsMemoryItem
								key={memory.id}
								memory={memory}
								className='last:pb-0 first:pt-0'
								onEdit={handleEdit}
								onDelete={setDeleteTarget}
							/>
						))}
					</div>
				)}
			</SettingsCard>

			<Dialog open={!!editMemory} onOpenChange={() => setEditMemory(null)}>
				<DialogContent className='p-6' showCloseButton={false}>
					<DialogHeader>
						<DialogTitle>Edit memory</DialogTitle>
					</DialogHeader>
					<div className='space-y-4'>
						<Textarea
							value={editContent}
							onChange={(event) => setEditContent(event.target.value)}
							rows={4}
						/>
						{updateMutation.error && <ErrorMessage message={errorMessage(updateMutation.error)} />}
					</div>
					<DialogFooter>
						<Button
							variant='ghost'
							onClick={() => setEditMemory(null)}
							disabled={updateMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							onClick={handleSaveEdit}
							disabled={updateMutation.isPending || editContent.trim().length === 0}
						>
							Save
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete memory?</AlertDialogTitle>
						<AlertDialogDescription>
							This memory will be removed and forgotten by the assistant.
						</AlertDialogDescription>
					</AlertDialogHeader>
					{deleteMutation.error && <ErrorMessage message={errorMessage(deleteMutation.error)} />}
					<AlertDialogFooter>
						<AlertDialogCancel variant='outline' size='sm' disabled={deleteMutation.isPending}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							variant='destructive'
							size='sm'
							onClick={handleConfirmDelete}
							disabled={deleteMutation.isPending}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
