import { Pencil, Trash2 } from 'lucide-react';
import type { Memory } from '@/queries/use-memories';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface SettingsMemoryItemProps {
	memory: Memory;
	onEdit: (memory: Memory) => void;
	onDelete: (memory: Memory) => void;
	className?: string;
}

export function SettingsMemoryItem({ memory, onEdit, onDelete, className }: SettingsMemoryItemProps) {
	const handleDelete = (e: React.MouseEvent) => {
		e.stopPropagation();
		onDelete(memory);
	};

	const handleEdit = (e: React.MouseEvent) => {
		e.stopPropagation();
		onEdit(memory);
	};

	return (
		<div className={cn('flex items-center gap-4 py-2 group', className)}>
			<div className='flex-1 min-w-0 space-y-0.5'>
				<p className='text-sm text-foreground line-clamp-2'>{memory.content}</p>
				<p className='text-xs text-muted-foreground'>
					{memory.source === 'user' ? 'Added by you' : 'Learned by the assistant'}
				</p>
			</div>

			<div className='flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity'>
				<Button variant='ghost-muted' size='icon-sm' onClick={handleEdit}>
					<Pencil />
				</Button>
				<Button variant='ghost-muted' size='icon-sm' onClick={handleDelete}>
					<Trash2 />
				</Button>
			</div>
		</div>
	);
}

export function SettingsMemorySkeleton({ className }: { className?: string }) {
	return (
		<div className={cn('flex items-start gap-4 py-2', className)}>
			<div className='flex-1 min-w-0 space-y-2'>
				<Skeleton className='h-3 w-24' />
				<Skeleton className='h-3 w-full max-w-xs' />
			</div>
		</div>
	);
}
