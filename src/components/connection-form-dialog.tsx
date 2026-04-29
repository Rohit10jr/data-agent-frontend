import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { connectionsApi, type Connection } from '@/lib/connections';
import { ApiError } from '@/lib/api';

interface ConnectionFormDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	connection?: Connection; // pass for edit mode; omit for create mode
}

export function ConnectionFormDialog({ open, onOpenChange, connection }: ConnectionFormDialogProps) {
	const isEdit = !!connection;
	const qc = useQueryClient();

	const [name, setName] = useState('');
	const [dsn, setDsn] = useState('');
	const [error, setError] = useState<string | undefined>();

	useEffect(() => {
		if (open) {
			setName(connection?.name ?? '');
			setDsn(connection?.dsn ?? '');
			setError(undefined);
		}
	}, [open, connection]);

	const createMut = useMutation({
		mutationFn: () => connectionsApi.create({ name, dsn }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['connections'] });
			onOpenChange(false);
		},
		onError: (err) => {
			setError(err instanceof ApiError ? err.message : 'Failed to create connection');
		},
	});

	const updateMut = useMutation({
		mutationFn: () => connectionsApi.update(connection!.id, { name, dsn }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['connections'] });
			onOpenChange(false);
		},
		onError: (err) => {
			setError(err instanceof ApiError ? err.message : 'Failed to update connection');
		},
	});

	const submitting = createMut.isPending || updateMut.isPending;

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setError(undefined);
		if (!name.trim()) {
			setError('Name is required');
			return;
		}
		if (!dsn.trim()) {
			setError('DSN is required');
			return;
		}
		if (isEdit) updateMut.mutate();
		else createMut.mutate();
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>{isEdit ? 'Edit connection' : 'New database connection'}</DialogTitle>
				</DialogHeader>

				<form onSubmit={handleSubmit} className='space-y-4'>
					<div className='space-y-1.5'>
						<label htmlFor='conn-name' className='text-sm font-medium'>
							Name
						</label>
						<Input
							id='conn-name'
							placeholder='My Production DB'
							value={name}
							onChange={(e) => setName(e.target.value)}
							autoFocus
						/>
					</div>

					<div className='space-y-1.5'>
						<label htmlFor='conn-dsn' className='text-sm font-medium'>
							DSN
						</label>
						<Input
							id='conn-dsn'
							placeholder='postgresql://user:password@host:5432/db'
							value={dsn}
							onChange={(e) => setDsn(e.target.value)}
						/>
						<p className='text-xs text-muted-foreground'>
							Examples: <code>postgresql://...</code>, <code>mysql://...</code>,{' '}
							<code>sqlite:///path/to/file.db</code>, <code>mssql+pyodbc://...</code>
						</p>
					</div>

					{error && <p className='text-red-500 text-sm'>{error}</p>}

					<div className='flex justify-end gap-2 pt-2'>
						<Button type='button' variant='outline' onClick={() => onOpenChange(false)} disabled={submitting}>
							Cancel
						</Button>
						<Button type='submit' disabled={submitting}>
							{submitting ? (isEdit ? 'Saving…' : 'Connecting…') : isEdit ? 'Save' : 'Create'}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
