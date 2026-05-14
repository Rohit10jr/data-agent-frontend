import { Check, ChevronDown, Database, Table2 } from 'lucide-react';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type AgentType = 'sql' | 'schema';

interface AgentOption {
	id: AgentType;
	label: string;
	hint: string;
	icon: typeof Database;
}

export const AGENTS: AgentOption[] = [
	{
		id: 'sql',
		label: 'SQL Agent',
		hint: 'Query an existing database',
		icon: Database,
	},
	{
		id: 'schema',
		label: 'Schema Agent',
		hint: 'Design a new database schema',
		icon: Table2,
	},
];

export const DEFAULT_AGENT: AgentType = 'sql';

const AGENT_STORAGE_KEY = 'chat.agent';

export function getInitialAgent(): AgentType {
	try {
		const stored = localStorage.getItem(AGENT_STORAGE_KEY);
		if (stored === 'sql' || stored === 'schema') {
			return stored;
		}
	} catch {
		// localStorage unavailable — fall through to default.
	}
	return DEFAULT_AGENT;
}

export function persistAgent(agent: AgentType): void {
	try {
		localStorage.setItem(AGENT_STORAGE_KEY, agent);
	} catch {
		// ignore
	}
}

interface AgentPickerProps {
	value: AgentType;
	onChange: (agent: AgentType) => void;
	disabled?: boolean;
}

export function AgentPicker({ value, onChange, disabled }: AgentPickerProps) {
	const selected = AGENTS.find((a) => a.id === value) ?? AGENTS[0];
	const SelectedIcon = selected.icon;

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
					<SelectedIcon className='size-3.5 shrink-0' />
					<span className='truncate max-w-[140px]'>{selected.label}</span>
					<ChevronDown className='size-3 opacity-60' />
				</button>
			</DropdownMenuTrigger>

			<DropdownMenuContent align='start' className='min-w-[240px]'>
				{AGENTS.map((a) => {
					const Icon = a.icon;
					return (
						<DropdownMenuItem
							key={a.id}
							onSelect={() => onChange(a.id)}
							className='flex items-center gap-2'
						>
							<Icon className='size-4 shrink-0 text-muted-foreground' />
							<div className='flex-1 min-w-0'>
								<div className='font-medium truncate'>{a.label}</div>
								<div className='text-[10px] text-muted-foreground'>{a.hint}</div>
							</div>
							{a.id === value && <Check className='size-4 shrink-0' />}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
