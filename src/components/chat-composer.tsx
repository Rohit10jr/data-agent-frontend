import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConnectionPicker } from '@/components/connection-picker';
import { ModelPicker, DEFAULT_MODEL_ID } from '@/components/model-picker';
import { cn } from '@/lib/utils';

interface ChatComposerProps {
	onSend: (text: string, opts: { connectionId?: string; model: string }) => void | Promise<void>;
	onAbort?: () => void;
	isStreaming: boolean;
	disabled?: boolean;
	placeholder?: string;
	/** When true, show the database picker. Use for new chats; existing chats hide it. */
	showConnectionPicker?: boolean;
}

export function ChatComposer({
	onSend,
	onAbort,
	isStreaming,
	disabled,
	placeholder = 'Ask a question about your data…',
	showConnectionPicker = false,
}: ChatComposerProps) {
	const [value, setValue] = useState('');
	const [connectionId, setConnectionId] = useState<string | undefined>();
	const [model, setModel] = useState<string>(DEFAULT_MODEL_ID);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
	}, [value]);

	const canSubmit =
		!!value.trim() && !isStreaming && (!showConnectionPicker || !!connectionId);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!canSubmit) return;
		const toSend = value;
		setValue('');
		onSend(toSend, { connectionId, model });
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSubmit(e);
		}
	};

	return (
		<form onSubmit={handleSubmit} className='border-t border-border bg-background p-3'>
			<div
				className={cn(
					'max-w-3xl mx-auto rounded-2xl border border-border bg-panel',
					'focus-within:border-foreground transition-colors',
				)}
			>
				<textarea
					ref={textareaRef}
					value={value}
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					disabled={disabled}
					rows={1}
					className={cn(
						'block w-full resize-none bg-transparent px-4 py-3 text-sm',
						'outline-none placeholder:text-muted-foreground',
					)}
				/>
				<div className='flex items-center px-2 pb-2 gap-2 flex-wrap'>
					{showConnectionPicker && (
						<ConnectionPicker
							value={connectionId}
							onChange={setConnectionId}
							disabled={isStreaming}
						/>
					)}
					<ModelPicker value={model} onChange={setModel} disabled={isStreaming} />
					<div className='flex-1' />
					{isStreaming ? (
						<Button
							type='button'
							size='icon-sm'
							variant='outline'
							onClick={onAbort}
							title='Stop generation'
						>
							<Square className='size-3 fill-current' />
						</Button>
					) : (
						<Button type='submit' size='icon-sm' disabled={!canSubmit} title='Send'>
							<ArrowUp className='size-4' />
						</Button>
					)}
				</div>
			</div>
			{showConnectionPicker && !connectionId && (
				<p className='max-w-3xl mx-auto pt-2 text-xs text-center text-muted-foreground'>
					Select a database to start a conversation.
				</p>
			)}
		</form>
	);
}
