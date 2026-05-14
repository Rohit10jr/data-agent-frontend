// Collapsible sidebar section listing the user's schema-agent projects.
// Lives next to the SQL chat list and operates independently — its own
// collapse state, its own list, its own delete/rename mutations.

import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronDown, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';

import { persistAgent } from '@/components/agent-picker';

import {
	type SchemaProjectListItem,
	useSchemaDeleteMutation,
	useSchemaListQuery,
	useSchemaRenameMutation,
} from '@/queries/use-schema-list-query';
import { cn, hideIf } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const STORAGE_KEY = 'sidebar-schemas-open';

export function SidebarSchemaSection({ isCollapsed }: { isCollapsed: boolean }) {
	const [isOpen, setIsOpen] = useState(() => localStorage.getItem(STORAGE_KEY) !== 'false');
	const projects = useSchemaListQuery();
	const navigate = useNavigate();

	const toggle = useCallback(() => {
		setIsOpen((prev) => {
			localStorage.setItem(STORAGE_KEY, String(!prev));
			return !prev;
		});
	}, []);

	// Pre-select the schema agent in the home-page composer, then navigate
	// there. The composer reads the persisted choice via getInitialAgent on
	// mount, so it'll come up with "Schema Agent" already selected.
	const startNewSchema = useCallback(() => {
		persistAgent('schema');
		navigate({ to: '/' });
	}, [navigate]);

	const items = projects.data ?? [];

	return (
		<div
			className={cn(
				'flex flex-col flex-1 overflow-hidden transition-[opacity,visibility] duration-300 border-t border-sidebar-border',
				hideIf(isCollapsed),
			)}
		>
			<div className='px-2 pt-2 space-y-0.5 flex items-center'>
				<button
					type='button'
					onClick={toggle}
					className={cn(
						'flex-1 flex items-center gap-2 px-2 py-1.5 text-xs uppercase tracking-wider text-muted-foreground',
						'hover:text-foreground rounded-md',
					)}
				>
					<ChevronDown
						className={cn('size-3 transition-transform', !isOpen && '-rotate-90')}
					/>
					<span className='font-medium'>Schemas</span>
					{items.length > 0 && (
						<span className='ml-auto text-[10px] text-muted-foreground'>{items.length}</span>
					)}
				</button>
				<button
					type='button'
					onClick={startNewSchema}
					className='p-1 mr-1 text-muted-foreground hover:text-foreground'
					title='New schema project'
				>
					<Plus className='size-3.5' />
				</button>
			</div>

			<div
				className={cn(
					'w-72 flex-1 overflow-y-auto px-2 space-y-1 transition-opacity duration-200',
					isOpen ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden',
				)}
			>
				{projects.isLoading ? (
					<p className='text-xs text-muted-foreground text-center p-4'>Loading…</p>
				) : items.length === 0 ? (
					<p className='text-xs text-muted-foreground text-center p-4'>
						No schema projects yet.
					</p>
				) : (
					items.map((p) => <SchemaProjectListRow key={p.slug} project={p} />)
				)}
			</div>
		</div>
	);
}

function SchemaProjectListRow({ project }: { project: SchemaProjectListItem }) {
	const [isEditing, setIsEditing] = useState(false);
	const [draft, setDraft] = useState(project.name ?? 'New Project');
	const inputRef = useRef<HTMLInputElement>(null);
	const submittingRef = useRef(false);
	const rename = useSchemaRenameMutation();
	const remove = useSchemaDeleteMutation();

	const startEditing = () => {
		setDraft(project.name ?? '');
		setIsEditing(true);
		requestAnimationFrame(() => {
			inputRef.current?.focus();
			inputRef.current?.select();
		});
	};

	const submit = async () => {
		if (!isEditing || submittingRef.current) return;
		const trimmed = draft.trim();
		if (trimmed && trimmed !== project.name) {
			submittingRef.current = true;
			try {
				await rename.mutateAsync({ slug: project.slug, name: trimmed });
			} finally {
				submittingRef.current = false;
			}
		}
		setIsEditing(false);
	};

	const cancel = () => {
		setDraft(project.name ?? '');
		setIsEditing(false);
	};

	const handleDelete = () => {
		if (window.confirm(`Delete "${project.name ?? 'this schema'}"? This can't be undone.`)) {
			remove.mutate(project.slug);
		}
	};

	return (
		<div className='group flex items-center gap-1 rounded-md hover:bg-sidebar-accent'>
			{isEditing ? (
				<input
					ref={inputRef}
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter') submit();
						else if (e.key === 'Escape') cancel();
					}}
					onBlur={submit}
					disabled={rename.isPending}
					className='flex-1 bg-transparent text-sm px-2 py-1.5 outline-none rounded-md border border-border'
				/>
			) : (
				<Link
					to='/schema/$slug'
					params={{ slug: project.slug }}
					activeProps={{ className: 'bg-sidebar-accent text-foreground font-medium' }}
					className='flex-1 truncate px-2 py-1.5 text-sm rounded-md'
				>
					{project.name ?? 'New Project'}
				</Link>
			)}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant='ghost'
						size='icon'
						className='size-7 opacity-0 group-hover:opacity-100 transition-opacity'
					>
						<MoreHorizontal className='size-3.5' />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align='end'>
					<DropdownMenuItem onClick={startEditing}>
						<Pencil className='size-3.5' />
						Rename
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleDelete} className='text-red-500 focus:text-red-500'>
						<Trash2 className='size-3.5' />
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
