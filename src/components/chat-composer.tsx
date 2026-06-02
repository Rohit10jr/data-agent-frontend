import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConnectionPicker } from '@/components/connection-picker';
import { ModelPicker, getInitialModel, persistModel } from '@/components/model-picker';
import { AgentPicker, getInitialAgent, persistAgent, type AgentType } from '@/components/agent-picker';
import { cn } from '@/lib/utils';

export interface ChatComposerSendOpts {
	connectionId?: string;
	model: string;
	agent: AgentType;
}

interface ChatComposerProps {
	onSend: (text: string, opts: ChatComposerSendOpts) => void | Promise<void>;
	onAbort?: () => void;
	isStreaming: boolean;
	disabled?: boolean;
	placeholder?: string;
	/** When true, show the agent picker (home page only — existing chats have a fixed agent). */
	showAgentPicker?: boolean;
	/** When true, show the database picker. Used for new SQL chats. Hidden when agent === 'schema'. */
	showConnectionPicker?: boolean;
}

export function ChatComposer({
	onSend,
	onAbort,
	isStreaming,
	disabled,
	placeholder = 'Ask a question about your data…',
	showAgentPicker = false,
	showConnectionPicker = false,
}: ChatComposerProps) {
	const [value, setValue] = useState('');
	const [connectionId, setConnectionId] = useState<string | undefined>();
	// Persisted picks — survive navigations + reloads.
	const [model, setModelState] = useState<string>(() => getInitialModel());
	const [agent, setAgentState] = useState<AgentType>(() =>
		showAgentPicker ? getInitialAgent() : 'sql',
	);

	const setModel = (next: string) => {
		setModelState(next);
		persistModel(next);
	};
	const setAgent = (next: AgentType) => {
		setAgentState(next);
		persistAgent(next);
	};

	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
	}, [value]);

	// Schema agent doesn't use a database connection — hide the picker when it's selected.
	const connectionPickerVisible = showConnectionPicker && agent === 'sql';
	const connectionRequired = connectionPickerVisible;

	const canSubmit =
		!!value.trim() && !isStreaming && (!connectionRequired || !!connectionId);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!canSubmit) return;
		const toSend = value;
		setValue('');
		onSend(toSend, { connectionId, model, agent });
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSubmit(e);
		}
	};

	const effectivePlaceholder =
		agent === 'schema'
			? 'Describe the app or database you want to design…'
			: connectionPickerVisible && !connectionId
				? 'Select a database to start a conversation.'
				: placeholder;

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
					placeholder={effectivePlaceholder}
					disabled={disabled}
					rows={1}
					className={cn(
						'block w-full resize-none bg-transparent px-4 py-3 text-sm',
						'outline-none placeholder:text-muted-foreground',
					)}
				/>
				<div className='flex items-center px-2 pb-2 gap-2 flex-wrap'>
					{showAgentPicker && (
						<AgentPicker value={agent} onChange={setAgent} disabled={isStreaming} />
					)}
					{connectionPickerVisible && (
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
		</form>
	);
}
