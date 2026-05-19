// Unified Starred section. Pulls starred items from BOTH the SQL chat list
// and the schema project list and renders them in a single collapsible group
// at the top of the sidebar. The respective Chats and Schemas sections below
// only render their non-starred items, so a starred entry never appears twice.

import { useCallback, useMemo, useState } from 'react';

import { ChatListItem as ChatListItemComponent } from '@/components/sidebar-chat-list-item';
import { SchemaProjectListRow } from '@/components/sidebar-schema-section';
import { SidebarSectionHeader } from '@/components/sidebar-section-header';
import { type ChatListItem, useChatListQuery } from '@/queries/use-chat-list-query';
import { type SchemaProjectListItem, useSchemaListQuery } from '@/queries/use-schema-list-query';
import { cn, hideIf } from '@/lib/utils';

const STORAGE_KEY = 'sidebar-starred-open';

type StarredItem =
	| { kind: 'chat'; key: string; sortAt: number; data: ChatListItem }
	| { kind: 'schema'; key: string; sortAt: number; data: SchemaProjectListItem };

export function SidebarStarredSection({ isCollapsed }: { isCollapsed: boolean }) {
	const [isOpen, setIsOpen] = useState(() => localStorage.getItem(STORAGE_KEY) !== 'false');
	const chats = useChatListQuery();
	const schemas = useSchemaListQuery();

	const toggle = useCallback(() => {
		setIsOpen((prev) => {
			localStorage.setItem(STORAGE_KEY, String(!prev));
			return !prev;
		});
	}, []);

	const items = useMemo<StarredItem[]>(() => {
		const starredChats: StarredItem[] = (chats.data?.chats ?? [])
			.filter((c) => c.isStarred)
			.map((c) => ({ kind: 'chat', key: `chat:${c.id}`, sortAt: c.createdAt, data: c }));

		const starredSchemas: StarredItem[] = (schemas.data ?? [])
			.filter((p) => p.isStarred)
			.map((p) => ({ kind: 'schema', key: `schema:${p.slug}`, sortAt: p.updatedAt, data: p }));

		return [...starredChats, ...starredSchemas].sort((a, b) => b.sortAt - a.sortAt);
	}, [chats.data, schemas.data]);

	if (items.length === 0) {
		return null;
	}

	return (
		<div className={cn('flex flex-col overflow-hidden', hideIf(isCollapsed))}>
			<div className='px-2 space-y-0.5'>
				<SidebarSectionHeader label='Starred' isOpen={isOpen} onToggle={toggle} />
			</div>

			{isOpen && (
				<div className='w-60 flex-none px-2 space-y-1'>
					{items.map((item) =>
						item.kind === 'chat' ? (
							<ChatListItemComponent key={item.key} chat={item.data} />
						) : (
							<SchemaProjectListRow key={item.key} project={item.data} />
						),
					)}
				</div>
			)}
		</div>
	);
}
