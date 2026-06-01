// Shared chat UI primitives used by both the SQL chat page and the schema
// agent page. These are the visual building blocks — avatar + bubble shell,
// plain-text bubble, and the thinking indicator. Page-specific rendering
// (SQL tool-call/result parts, schema turns) composes from these.

import type { ReactNode } from 'react';
import { Bot, User } from 'lucide-react';

import { MarkdownText } from './markdown-text';
import { cn } from '@/lib/utils';

export type ChatRole = 'user' | 'assistant';

/** Avatar + flex layout shell. Children render inside the content column. */
export function MessageRow({ role, children }: { role: ChatRole; children: ReactNode }) {
	const isUser = role === 'user';
	return (
		<div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
			<div
				className={cn(
					'size-8 shrink-0 rounded-full flex items-center justify-center',
					isUser ? 'bg-primary text-primary-foreground' : 'bg-sidebar-accent',
				)}
			>
				{isUser ? <User className='size-4' /> : <Bot className='size-4' />}
			</div>
			<div className={cn('flex-1 min-w-0 space-y-2', isUser && 'flex flex-col items-end')}>
				{children}
			</div>
		</div>
	);
}

/**
 * Message bubble. User text renders verbatim (whitespace preserved). Assistant
 * text is parsed as markdown so bold/lists/code/tables/links render properly.
 */
export function TextBubble({ role, text }: { role: ChatRole; text: string }) {
	const isUser = role === 'user';
	if (isUser) {
		return (
			<div className='rounded-lg px-4 py-2 text-sm whitespace-pre-wrap bg-primary text-primary-foreground max-w-2xl'>
				{text}
			</div>
		);
	}
	return (
		<div className='rounded-lg px-4 py-2 bg-sidebar-accent'>
			<MarkdownText text={text} />
		</div>
	);
}

/**
 * Animated "working" indicator. `label` lets callers surface progress detail
 * — e.g. the schema agent passes its current node label ("Designing the
 * schema") instead of the generic "Thinking".
 */
export function ThinkingIndicator({ label = 'Thinking' }: { label?: string }) {
	return (
		<div
			className='inline-flex items-center gap-2 rounded-lg bg-sidebar-accent px-4 py-2.5 text-sm text-muted-foreground'
			role='status'
			aria-live='polite'
		>
			<span>{label}</span>
			<span className='inline-flex items-center gap-0.5'>
				<span className='size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.3s]' />
				<span className='size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.15s]' />
				<span className='size-1.5 rounded-full bg-muted-foreground animate-bounce' />
			</span>
		</div>
	);
}
