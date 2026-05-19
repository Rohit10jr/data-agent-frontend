import { Database, Check, ChevronDown, Plus } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useConnectionsQuery } from '@/queries/use-connections-query';
import { cn } from '@/lib/utils';

interface ConnectionPickerProps {
	value: string | undefined;
	onChange: (connectionId: string) => void;
	disabled?: boolean;
}

export function ConnectionPicker({ value, onChange, disabled }: ConnectionPickerProps) {
	const { data: connections, isLoading } = useConnectionsQuery();

	const selected = connections?.find((c) => c.id === value);

	const label = isLoading
		? 'Loading…'
		: selected
			? selected.name
			: connections && connections.length === 0
				? 'No databases'
				: 'Select database';

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled || isLoading}>
				<button
					type='button'
					className={cn(
						'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium',
						'border border-border bg-background hover:bg-sidebar-accent transition-colors',
						'disabled:opacity-50 disabled:cursor-not-allowed',
						!selected && 'text-muted-foreground',
					)}
				>
					<Database className='size-3.5 shrink-0' />
					<span className='truncate max-w-[140px]'>{label}</span>
					{selected && (
						<span className='uppercase text-[10px] text-muted-foreground bg-sidebar-accent px-1 rounded'>
							{selected.type}
						</span>
					)}
					<ChevronDown className='size-3 opacity-60' />
				</button>
			</DropdownMenuTrigger>

			<DropdownMenuContent align='start' className='min-w-[240px]'>
				{(!connections || connections.length === 0) ? (
					<div className='px-3 py-2 text-xs text-muted-foreground'>
						No connections yet.
					</div>
				) : (
					connections.map((c) => (
						<DropdownMenuItem
							key={c.id}
							onSelect={() => onChange(c.id)}
							className='flex items-center gap-2'
						>
							<Database className='size-4 shrink-0 text-muted-foreground' />
							<div className='flex-1 min-w-0'>
								<div className='font-medium truncate flex items-center gap-1.5'>
									<span className='truncate'>{c.name}</span>
									{c.is_sample && (
										<span className='shrink-0 text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded bg-sidebar-accent text-muted-foreground'>
											Sample
										</span>
									)}
								</div>
								<div className='text-[10px] text-muted-foreground uppercase'>{c.type}</div>
							</div>
							{c.id === value && <Check className='size-4 shrink-0' />}
						</DropdownMenuItem>
					))
				)}

				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link to='/connections' className='flex items-center gap-2'>
						<Plus className='size-4' />
						<span>Add connection</span>
					</Link>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
