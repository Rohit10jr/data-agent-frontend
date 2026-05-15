// Collapsible sidebar section listing the user's schema-agent projects.
// Lives next to the SQL chat list and operates independently — its own
// collapse state, its own list, its own delete/rename mutations.

import { useCallback, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ChevronDown, Ellipsis, Pencil, Plus, TrashIcon } from 'lucide-react';

import { persistAgent } from '@/components/agent-picker';

import {
	type SchemaProjectListItem,
	useSchemaDeleteMutation,
	useSchemaListQuery,
	useSchemaRenameMutation,
} from '@/queries/use-schema-list-query';
import { useTimeAgo } from '@/hooks/use-time-ago';
import { cn, hideIf } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InputEdit } from '@/components/ui/input-edit';
import { Link } from '@/components/ui/link';

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
					'w-60 flex-1 overflow-y-auto px-2 space-y-1 transition-opacity duration-200',
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
	const navigate = useNavigate();
	const rename = useSchemaRenameMutation();
	const remove = useSchemaDeleteMutation();
	const timeAgo = useTimeAgo(project.updatedAt);
	const [draft, setDraft] = useState(project.name ?? 'New Project');
	const [isRenaming, setIsRenaming] = useState(false);

	const handleSubmit = async () => {
		const trimmed = draft.trim();
		if (trimmed && trimmed !== project.name) {
			await rename.mutateAsync({ slug: project.slug, name: trimmed });
		}
		setIsRenaming(false);
	};

	const handleEscape = () => {
		setDraft(project.name ?? 'New Project');
		setIsRenaming(false);
	};

	const handleRenameSelect = () => {
		setDraft(project.name ?? 'New Project');
		setIsRenaming((p) => !p);
	};

	const handleDeleteSelect = () => {
		if (confirm(`Delete "${project.name ?? 'this schema'}"? This cannot be undone.`)) {
			remove.mutate(project.slug, {
				onSuccess: () => navigate({ to: '/' }),
			});
		}
	};

	return (
		<Link
			to='/schema/$slug'
			params={{ slug: project.slug }}
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
			onDoubleClick={() => setIsRenaming(true)}
		>
			{isRenaming ? (
				<InputEdit
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onSubmit={handleSubmit}
					onEscape={handleEscape}
					disabled={rename.isPending}
				/>
			) : (
				<>
					<div className='truncate text-sm mr-auto'>{project.name ?? 'New Project'}</div>
					<div className='text-xs text-muted-foreground whitespace-nowrap'>
						{timeAgo.humanReadable}
					</div>

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
				</>
			)}
		</Link>
	);
}
