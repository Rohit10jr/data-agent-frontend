import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Database, Plus, Pencil, Trash2, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConnectionFormDialog } from '@/components/connection-form-dialog';
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
import { connectionsApi, type Connection } from '@/lib/connections';

export const Route = createFileRoute('/_sidebar-layout/connections')({
	component: ConnectionsPage,
});

function ConnectionsPage() {
	const qc = useQueryClient();
	const { data: connections, isLoading, error } = useQuery({
		queryKey: ['connections'],
		queryFn: connectionsApi.list,
	});

	const [formOpen, setFormOpen] = useState(false);
	const [editingConnection, setEditingConnection] = useState<Connection | undefined>();
	const [pendingDelete, setPendingDelete] = useState<Connection | null>(null);

	const deleteMut = useMutation({
		mutationFn: (id: string) => connectionsApi.delete(id),
		onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
	});

	const refreshMut = useMutation({
		mutationFn: (id: string) => connectionsApi.refresh(id),
		onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
	});

	const restoreSamplesMut = useMutation({
		mutationFn: () => connectionsApi.restoreSamples(),
		onSuccess: ({ created }) => {
			qc.invalidateQueries({ queryKey: ['connections'] });
			if (created === 0) {
				alert('Sample databases are already in your connections list.');
			}
		},
	});

	const openCreate = () => {
		setEditingConnection(undefined);
		setFormOpen(true);
	};

	const openEdit = (c: Connection) => {
		setEditingConnection(c);
		setFormOpen(true);
	};

	const handleDelete = (c: Connection) => {
		setPendingDelete(c);
	};

	const handleConfirmDelete = () => {
		if (pendingDelete) {
			deleteMut.mutate(pendingDelete.id);
			setPendingDelete(null);
		}
	};

	return (
		<div className='flex flex-col flex-1 overflow-y-auto'>
			<div className='max-w-3xl w-full mx-auto p-6 space-y-6'>
				<div className='flex items-center justify-between'>
					<div>
						<h1 className='text-2xl font-semibold'>Database connections</h1>
						<p className='text-sm text-muted-foreground mt-1'>
							Connect databases the agent can query.
						</p>
					</div>
					<div className='flex items-center gap-2'>
						<Button
							variant='outline'
							onClick={() => restoreSamplesMut.mutate()}
							disabled={restoreSamplesMut.isPending}
							title='Re-add the sample databases (e.g. Netflix) if you deleted them'
						>
							<Sparkles className='size-4' />
							{restoreSamplesMut.isPending ? 'Restoring…' : 'Restore samples'}
						</Button>
						<Button onClick={openCreate}>
							<Plus className='size-4' />
							New connection
						</Button>
					</div>
				</div>

				{isLoading && <p className='text-sm text-muted-foreground'>Loading…</p>}

				{error && (
					<p className='text-sm text-red-500'>
						Failed to load connections: {error instanceof Error ? error.message : 'unknown error'}
					</p>
				)}

				{connections && connections.length === 0 && (
					<div className='border border-dashed border-border rounded-lg p-12 text-center'>
						<Database className='size-10 mx-auto text-muted-foreground mb-3' />
						<h2 className='font-medium mb-1'>No connections yet</h2>
						<p className='text-sm text-muted-foreground mb-4'>
							Add your first database to start asking questions about your data.
						</p>
						<Button onClick={openCreate}>
							<Plus className='size-4' />
							Add a database
						</Button>
					</div>
				)}

				{connections && connections.length > 0 && (
					<div className='space-y-2'>
						{connections.map((c) => (
							<ConnectionRow
								key={c.id}
								connection={c}
								onEdit={() => openEdit(c)}
								onDelete={() => handleDelete(c)}
								onRefresh={() => refreshMut.mutate(c.id)}
								refreshing={refreshMut.isPending && refreshMut.variables === c.id}
								deleting={deleteMut.isPending && deleteMut.variables === c.id}
							/>
						))}
					</div>
				)}
			</div>

			<ConnectionFormDialog open={formOpen} onOpenChange={setFormOpen} connection={editingConnection} />

			<AlertDialog
				open={pendingDelete !== null}
				onOpenChange={(open) => !open && setPendingDelete(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete connection?</AlertDialogTitle>
						<AlertDialogDescription>
							Delete connection &ldquo;{pendingDelete?.name}&rdquo;? This cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction variant='destructive' onClick={handleConfirmDelete}>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

interface ConnectionRowProps {
	connection: Connection;
	onEdit: () => void;
	onDelete: () => void;
	onRefresh: () => void;
	refreshing: boolean;
	deleting: boolean;
}

function ConnectionRow({ connection, onEdit, onDelete, onRefresh, refreshing, deleting }: ConnectionRowProps) {
	return (
		<div className='border border-border rounded-lg p-4 flex items-center gap-4'>
			<div className='size-10 shrink-0 rounded-md bg-sidebar-accent flex items-center justify-center'>
				<Database className='size-5 text-muted-foreground' />
			</div>

			<div className='flex-1 min-w-0'>
				<div className='flex items-center gap-2'>
					<h3 className='font-medium truncate'>{connection.name}</h3>
					<span className='text-xs uppercase text-muted-foreground bg-sidebar-accent px-1.5 py-0.5 rounded'>
						{connection.type}
					</span>
				</div>
				<p className='text-xs text-muted-foreground truncate font-mono mt-0.5'>
					{maskDsn(connection.dsn)}
				</p>
			</div>

			<div className='flex items-center gap-1 shrink-0'>
				<Button variant='ghost' size='icon-sm' onClick={onRefresh} disabled={refreshing} title='Refresh schema'>
					<RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
				</Button>
				<Button variant='ghost' size='icon-sm' onClick={onEdit} title='Edit'>
					<Pencil className='size-4' />
				</Button>
				<Button
					variant='ghost'
					size='icon-sm'
					onClick={onDelete}
					disabled={deleting}
					title='Delete'
					className='text-red-500 hover:text-red-600 hover:bg-red-500/10'
				>
					<Trash2 className='size-4' />
				</Button>
			</div>
		</div>
	);
}

/**
 * Hide credentials in DSN for display: postgresql://user:****@host:5432/db
 */
function maskDsn(dsn: string): string {
	try {
		// Replace `://anything:secret@` with `://anything:****@`
		return dsn.replace(/(:\/\/)([^:@/]+):([^@/]+)@/, '$1$2:****@');
	} catch {
		return dsn;
	}
}
