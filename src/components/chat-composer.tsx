import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatComposerProps {
	onSend: (text: string) => void | Promise<void>;
	onAbort?: () => void;
	isStreaming: boolean;
	disabled?: boolean;
	placeholder?: string;
}

export function ChatComposer({
	onSend,
	onAbort,
	isStreaming,
	disabled,
	placeholder = 'Ask a question about your data…',
}: ChatComposerProps) {
	const [value, setValue] = useState('');
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Auto-grow the textarea up to a few lines.
	useEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
	}, [value]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!value.trim() || isStreaming) return;
		const toSend = value;
		setValue('');
		onSend(toSend);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		// Enter sends; Shift+Enter inserts newline.
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
				<div className='flex justify-end px-2 pb-2'>
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
						<Button
							type='submit'
							size='icon-sm'
							disabled={disabled || !value.trim()}
							title='Send'
						>
							<ArrowUp className='size-4' />
						</Button>
					)}
				</div>
			</div>
		</form>
	);
}
