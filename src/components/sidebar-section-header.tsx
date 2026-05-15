// Shared collapsible-section header used by both the SQL chat list ("Chats")
// and the schema list ("Schemas") in the sidebar. Renders a button with a
// label, a rotating chevron, optional activity indicator (running spinner or
// unread dot), and an optional `extra` slot on the right.

import { ChevronRight } from 'lucide-react';

import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

interface Props {
	label: string;
	isOpen: boolean;
	onToggle: () => void;
	activity?: { running: boolean; unread: boolean };
	extra?: React.ReactNode;
}

export function SidebarSectionHeader({ label, isOpen, onToggle, activity, extra }: Props) {
	const showIndicator = !isOpen && activity;

	return (
		<button
			onClick={onToggle}
			className='group relative flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors w-full text-left text-muted-foreground whitespace-nowrap cursor-pointer'
		>
			<span>{label}</span>
			<ChevronRight
				className={cn(
					'size-4 shrink-0 transition-[transform,opacity,rotate] duration-200 group-hover:opacity-100',
					isOpen ? 'opacity-100 rotate-90' : 'opacity-0 rotate-0',
				)}
			/>
			<div className='absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2'>
				{showIndicator && activity.running && <Spinner className='size-3' />}
				{showIndicator && !activity.running && activity.unread && (
					<span className='size-1.5 rounded-full bg-primary' />
				)}
				{!showIndicator && extra}
			</div>
		</button>
	);
}
