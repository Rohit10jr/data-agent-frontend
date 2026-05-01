import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, User, Bot, Database, Wrench } from 'lucide-react';
import { useChatStream } from '@/queries/use-chat-stream';
import type { HistoryPart, HistoryMessage } from '@/queries/use-chat-history-query';
import { Spinner } from '@/components/ui/spinner';
import { ChatComposer } from '@/components/chat-composer';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_sidebar-layout/_chat-layout/$chatId')({
	component: ChatDetailPage,
});

function ChatDetailPage() {
	const { chatId } = Route.useParams();
	const { messages, sendMessage, abort, isStreaming, isLoading, error, streamError } = useChatStream({
		threadId: chatId,
	});

	// Auto-scroll to bottom on new content.
	const bottomRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
	}, [messages]);

	if (isLoading) {
		return (
			<div className='flex-1 flex items-center justify-center'>
				<Spinner className='size-5' />
			</div>
		);
	}

	if (error) {
		return (
			<div className='flex-1 flex items-center justify-center p-8'>
				<p className='text-red-500 text-sm'>
					Failed to load chat: {error instanceof Error ? error.message : 'unknown error'}
				</p>
			</div>
		);
	}

	return (
		<div className='flex flex-col flex-1 overflow-hidden'>
			<div className='flex-1 overflow-y-auto'>
				<div className='max-w-3xl mx-auto p-6 space-y-6'>
					{messages.length === 0 ? (
						<p className='text-sm text-muted-foreground text-center pt-12'>
							No messages yet. Send one to start the conversation.
						</p>
					) : (
						messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
					)}
					{streamError && (
						<p className='text-sm text-red-500 text-center'>Error: {streamError}</p>
					)}
					<div ref={bottomRef} />
				</div>
			</div>

			<ChatComposer
				onSend={sendMessage}
				onAbort={abort}
				isStreaming={isStreaming}
			/>
		</div>
	);
}

// ── Message bubble ────────────────────────────────────────────────────
function MessageBubble({ message }: { message: HistoryMessage }) {
	const isUser = message.role === 'user';

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
				{message.parts.map((part, i) => (
					<PartRenderer key={i} part={part} isUser={isUser} />
				))}

				{message.usage?.total_tokens && !isUser && (
					<p className='text-xs text-muted-foreground'>
						{message.usage.input_tokens} in · {message.usage.output_tokens} out ·{' '}
						{message.usage.total_tokens} tokens
					</p>
				)}
			</div>
		</div>
	);
}

// ── Part rendering ────────────────────────────────────────────────────
function PartRenderer({ part, isUser }: { part: HistoryPart; isUser: boolean }) {
	switch (part.type) {
		case 'text':
			return (
				<div
					className={cn(
						'rounded-lg px-4 py-2 text-sm whitespace-pre-wrap',
						isUser ? 'bg-primary text-primary-foreground max-w-2xl' : 'bg-sidebar-accent',
					)}
				>
					{part.text}
				</div>
			);

		case 'reasoning':
			return <ReasoningBlock text={part.text} />;

		case 'tool-call':
			return <ToolCallBlock part={part} />;

		case 'tool-result':
			return <ToolResultBlock part={part} />;
	}
}

function ReasoningBlock({ text }: { text: string }) {
	const [open, setOpen] = useState(false);
	return (
		<div className='border border-dashed border-border rounded-md text-xs'>
			<button
				type='button'
				onClick={() => setOpen((p) => !p)}
				className='w-full flex items-center gap-2 px-3 py-1.5 text-muted-foreground hover:text-foreground'
			>
				<ChevronRight className={cn('size-3 transition-transform', open && 'rotate-90')} />
				<span className='italic'>Reasoning</span>
			</button>
			{open && (
				<div className='px-3 pb-2 text-muted-foreground whitespace-pre-wrap'>{text}</div>
			)}
		</div>
	);
}

function ToolCallBlock({ part }: { part: Extract<HistoryPart, { type: 'tool-call' }> }) {
	const isSql = part.tool_name === 'run_sql_query';
	const sql = isSql ? String((part.args as { query?: string }).query ?? '') : '';

	return (
		<div className='border border-border rounded-md bg-panel'>
			<div className='flex items-center gap-2 px-3 py-1.5 border-b border-border bg-sidebar-accent text-xs'>
				{isSql ? <Database className='size-3.5' /> : <Wrench className='size-3.5' />}
				<span className='font-mono font-medium'>{part.tool_name}</span>
			</div>
			{isSql ? (
				<pre className='p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap'>{sql}</pre>
			) : (
				<pre className='p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap text-muted-foreground'>
					{JSON.stringify(part.args, null, 2)}
				</pre>
			)}
		</div>
	);
}

function ToolResultBlock({ part }: { part: Extract<HistoryPart, { type: 'tool-result' }> }) {
	const [open, setOpen] = useState(part.tool_name === 'run_sql_query');
	const content = part.content;

	return (
		<div className='border border-border rounded-md text-xs'>
			<button
				type='button'
				onClick={() => setOpen((p) => !p)}
				className='w-full flex items-center gap-2 px-3 py-1.5 hover:bg-sidebar-accent'
			>
				<ChevronRight className={cn('size-3 transition-transform', open && 'rotate-90')} />
				<span className='text-muted-foreground'>Result</span>
				<span className='font-mono ml-auto truncate text-muted-foreground'>{part.tool_name}</span>
			</button>
			{open && (
				<pre className='px-3 pb-2 font-mono overflow-x-auto whitespace-pre-wrap text-muted-foreground'>
					{content}
				</pre>
			)}
		</div>
	);
}
