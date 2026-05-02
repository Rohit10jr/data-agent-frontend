import { Sparkles, Check, ChevronDown } from 'lucide-react';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// Hardcoded list of models the backend has pre-initialised in
// LLMS_WITH_TOOLS. Keep this in sync with sql_agent.SUPPORTED_MODELS.
export interface ModelOption {
	id: string;
	label: string;
	hint?: string;
}

export const MODELS: ModelOption[] = [
	{ id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', hint: 'OpenAI · default' },
	{ id: 'groq/compound', label: 'Groq Compound', hint: 'Groq' },
	{ id: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B', hint: 'Meta' },
	{ id: 'qwen/qwen3-32b', label: 'Qwen 3 32B', hint: 'Alibaba' },
];

export const DEFAULT_MODEL_ID = MODELS[0].id;

// ── localStorage persistence ──────────────────────────────────────────
// Model choice is treated as a personal preference (like ChatGPT's model
// switcher), so it persists across navigations and reloads. Validates against
// the known list before restoring — guards against stale ids if a model is
// removed from MODELS.

const MODEL_STORAGE_KEY = 'chat.model';

export function getInitialModel(): string {
	try {
		const stored = localStorage.getItem(MODEL_STORAGE_KEY);
		if (stored && MODELS.some((m) => m.id === stored)) {
			return stored;
		}
	} catch {
		// localStorage unavailable (private mode, etc.) — fall through to default.
	}
	return DEFAULT_MODEL_ID;
}

export function persistModel(modelId: string): void {
	try {
		localStorage.setItem(MODEL_STORAGE_KEY, modelId);
	} catch {
		// ignore
	}
}

interface ModelPickerProps {
	value: string;
	onChange: (modelId: string) => void;
	disabled?: boolean;
}

export function ModelPicker({ value, onChange, disabled }: ModelPickerProps) {
	const selected = MODELS.find((m) => m.id === value) ?? MODELS[0];

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled}>
				<button
					type='button'
					className={cn(
						'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium',
						'border border-border bg-background hover:bg-sidebar-accent transition-colors',
						'disabled:opacity-50 disabled:cursor-not-allowed',
					)}
				>
					<Sparkles className='size-3.5 shrink-0' />
					<span className='truncate max-w-[140px]'>{selected.label}</span>
					<ChevronDown className='size-3 opacity-60' />
				</button>
			</DropdownMenuTrigger>

			<DropdownMenuContent align='start' className='min-w-[260px]'>
				{MODELS.map((m) => (
					<DropdownMenuItem
						key={m.id}
						onSelect={() => onChange(m.id)}
						className='flex items-center gap-2'
					>
						<Sparkles className='size-4 shrink-0 text-muted-foreground' />
						<div className='flex-1 min-w-0'>
							<div className='font-medium truncate'>{m.label}</div>
							{m.hint && (
								<div className='text-[10px] text-muted-foreground'>{m.hint}</div>
							)}
						</div>
						{m.id === value && <Check className='size-4 shrink-0' />}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
