// Collapsible sidebar section listing the user's schema-agent projects.
// Starred schemas are pulled into the unified Starred section at the top of
// the sidebar (see sidebar-starred-section.tsx); this list shows non-starred
// schemas only.

import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Ellipsis, Pencil, Star, StarOff, TrashIcon } from 'lucide-react';

import {
	type SchemaProjectListItem,
	useSchemaDeleteMutation,
	useSchemaListQuery,
	useSchemaRenameMutation,
	useSchemaStarMutation,
} from '@/queries/use-schema-list-query';
import { useChatActivity } from '@/hooks/use-chat-activity';
import { useTimeAgo } from '@/hooks/use-time-ago';
import { cn, hideIf } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InputEdit } from '@/components/ui/input-edit';
import { Link } from '@/components/ui/link';
import { SidebarSectionHeader } from '@/components/sidebar-section-header';

const STORAGE_KEY = 'sidebar-schemas-open';

export function SidebarSchemaSection({ isCollapsed }: { isCollapsed: boolean }) {
	const [isOpen, setIsOpen] = useState(() => localStorage.getItem(STORAGE_KEY) !== 'false');
	const projects = useSchemaListQuery();

	const toggle = useCallback(() => {
		setIsOpen((prev) => {
			localStorage.setItem(STORAGE_KEY, String(!prev));
			return !prev;
		});
	}, []);

	const regular = useMemo(
		() => (projects.data ?? []).filter((p) => !p.isStarred),
		[projects.data],
	);

	return (
		<div
			className={cn(
				'flex flex-col overflow-hidden transition-[opacity,visibility] duration-300 border-t border-sidebar-border',
				isOpen && 'flex-1 min-h-0',
				hideIf(isCollapsed),
			)}
		>
			<div className='px-2 space-y-0.5'>
				<SidebarSectionHeader label='Schemas' isOpen={isOpen} onToggle={toggle} />
			</div>

			{isOpen && (
				<div className='w-60 flex-1 overflow-y-auto px-2 space-y-1'>
					{projects.isLoading ? (
						<p className='text-xs text-muted-foreground text-center p-4'>Loading…</p>
					) : regular.length === 0 ? (
						<p className='text-xs text-muted-foreground text-center p-4'>
							No schema projects yet.
						</p>
					) : (
						regular.map((p) => <SchemaProjectListRow key={p.slug} project={p} />)
					)}
				</div>
			)}
		</div>
	);
}

export function SchemaProjectListRow({ project }: { project: SchemaProjectListItem }) {
	const navigate = useNavigate();
	const rename = useSchemaRenameMutation();
	const remove = useSchemaDeleteMutation();
	const toggleStar = useSchemaStarMutation();
	const timeAgo = useTimeAgo(project.updatedAt);
	const activity = useChatActivity(project.slug);
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

	const handleStarSelect = () => {
		toggleStar.mutate({ slug: project.slug, isStarred: !project.isStarred });
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
					{activity.unread && <span className='size-1.5 shrink-0 rounded-full bg-primary' />}
					<div className='truncate text-sm mr-auto'>{project.name ?? 'New Project'}</div>
					{activity.running ? (
						<Spinner className='size-3.5 shrink-0' />
					) : (
						<div className='text-xs text-muted-foreground whitespace-nowrap'>
							{timeAgo.humanReadable}
						</div>
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
									{project.isStarred ? <StarOff /> : <Star />}
									{project.isStarred ? 'Unstar' : 'Star'}
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
				</>
			)}
		</Link>
	);
}
