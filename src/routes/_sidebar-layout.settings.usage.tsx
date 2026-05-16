import { useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
	Bar,
	BarChart,
	CartesianGrid,
	Legend,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import type { TooltipProps } from 'recharts';

import { useUsageQuery, type UsageGranularity, type UsageBucket } from '@/queries/use-usage-query';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_sidebar-layout/settings/usage')({
	component: UsagePage,
});

const GRANULARITIES: { value: UsageGranularity; label: string }[] = [
	{ value: 'hour', label: 'Hour' },
	{ value: 'day', label: 'Day' },
	{ value: 'month', label: 'Month' },
];

function UsagePage() {
	const [granularity, setGranularity] = useState<UsageGranularity>('day');
	const { data, isLoading, error } = useUsageQuery(granularity);

	return (
		<div className='flex flex-col flex-1 overflow-y-auto'>
			<div className='max-w-3xl w-full mx-auto p-6 space-y-6'>
				<div>
					<h1 className='text-2xl font-semibold'>Token usage</h1>
					<p className='text-sm text-muted-foreground mt-1'>
						How many tokens this account has consumed across all chats.
					</p>
				</div>

				{isLoading && (
					<div className='flex justify-center py-12'>
						<Spinner className='size-5' />
					</div>
				)}

				{error && (
					<p className='text-sm text-red-500'>
						Failed to load usage: {error instanceof Error ? error.message : 'unknown error'}
					</p>
				)}

				{data && (
					<>
						<TotalUsageCard
							totalUsed={data.total_used}
							quota={data.quota}
							percent={data.percent_used}
						/>

						<div className='border border-border rounded-lg p-5 space-y-4'>
							<div className='flex items-center justify-between'>
								<div>
									<h2 className='font-medium'>Tokens over time</h2>
									<p className='text-xs text-muted-foreground mt-0.5'>
										{granularity === 'hour' && 'Last 24 hours'}
										{granularity === 'day' && 'Last 30 days'}
										{granularity === 'month' && 'Last 12 months'}
									</p>
								</div>
								<GranularitySwitch value={granularity} onChange={setGranularity} />
							</div>
							<UsageBarChart buckets={data.buckets} granularity={granularity} />
						</div>
					</>
				)}
			</div>
		</div>
	);
}

// ── Total card with progress bar ──────────────────────────────────────
function TotalUsageCard({
	totalUsed,
	quota,
	percent,
}: {
	totalUsed: number;
	quota: number;
	percent: number;
}) {
	const overUsed = percent >= 100;
	const nearLimit = percent >= 80 && percent < 100;

	return (
		<div className='border border-border rounded-lg p-5 space-y-3'>
			<div className='flex items-baseline justify-between'>
				<h2 className='font-medium'>Total used</h2>
				<span
					className={cn(
						'text-sm font-mono',
						overUsed && 'text-red-500',
						nearLimit && 'text-amber-600',
					)}
				>
					{percent.toFixed(2)}%
				</span>
			</div>

			<div className='h-2 rounded-full bg-sidebar-accent overflow-hidden'>
				<div
					className={cn(
						'h-full transition-all',
						overUsed
							? 'bg-red-500'
							: nearLimit
								? 'bg-amber-500'
								: 'bg-foreground',
					)}
					style={{ width: `${Math.min(percent, 100)}%` }}
				/>
			</div>

			<p className='text-xs text-muted-foreground'>
				<span className='font-mono'>{totalUsed.toLocaleString()}</span>
				{' / '}
				<span className='font-mono'>{quota.toLocaleString()}</span> tokens
			</p>
		</div>
	);
}

// ── Granularity toggle ────────────────────────────────────────────────
function GranularitySwitch({
	value,
	onChange,
}: {
	value: UsageGranularity;
	onChange: (next: UsageGranularity) => void;
}) {
	return (
		<div className='inline-flex items-center rounded-md border border-border p-0.5 bg-background'>
			{GRANULARITIES.map((g) => (
				<button
					key={g.value}
					type='button'
					onClick={() => onChange(g.value)}
					className={cn(
						'px-3 py-1 text-xs rounded transition-colors',
						value === g.value
							? 'bg-foreground text-background'
							: 'text-muted-foreground hover:text-foreground',
					)}
				>
					{g.label}
				</button>
			))}
		</div>
	);
}

// ── Stacked bar chart (Recharts) ──────────────────────────────────────
interface ChartRow {
	label: string;
	input: number;
	reasoning: number;
	output: number;
}

function UsageBarChart({
	buckets,
	granularity,
}: {
	buckets: UsageBucket[];
	granularity: UsageGranularity;
}) {
	const data = useMemo<ChartRow[]>(
		() =>
			buckets.map((b) => ({
				label: formatBucket(b.bucket, granularity),
				input: b.input_tokens,
				reasoning: b.reasoning_tokens,
				output: b.output_tokens,
			})),
		[buckets, granularity],
	);

	const totalInWindow = buckets.reduce((sum, b) => sum + b.total_tokens, 0);

	if (buckets.length === 0) {
		return (
			<div className='flex items-center justify-center h-64 text-sm text-muted-foreground'>
				No usage in this window yet.
			</div>
		);
	}

	return (
		<div className='space-y-3'>
			<div className='h-64'>
				<ResponsiveContainer width='100%' height='100%'>
					<BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
						<CartesianGrid
							strokeDasharray='3 3'
							stroke='var(--border)'
							vertical={false}
						/>
						<XAxis
							dataKey='label'
							tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
							axisLine={{ stroke: 'var(--border)' }}
							tickLine={false}
							interval='preserveStartEnd'
						/>
						<YAxis
							tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
							axisLine={false}
							tickLine={false}
							tickFormatter={formatTokenCount}
							width={60}
						/>
						<Tooltip
							content={<UsageTooltip />}
							cursor={{ fill: 'var(--sidebar-accent)', opacity: 0.4 }}
						/>
						<Legend
							iconType='circle'
							iconSize={8}
							wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
						/>
						<Bar
							dataKey='input'
							name='Input'
							stackId='tokens'
							fill='var(--chart-1)'
						/>
						<Bar
							dataKey='reasoning'
							name='Reasoning'
							stackId='tokens'
							fill='var(--chart-2)'
						/>
						<Bar
							dataKey='output'
							name='Output'
							stackId='tokens'
							fill='var(--chart-3)'
							radius={[4, 4, 0, 0]}
						/>
					</BarChart>
				</ResponsiveContainer>
			</div>

			<p className='text-xs text-muted-foreground text-center'>
				<span className='font-mono'>{totalInWindow.toLocaleString()}</span> tokens in window
			</p>
		</div>
	);
}

function formatTokenCount(value: number): string {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
	return String(value);
}

function UsageTooltip({ active, payload, label }: TooltipProps<number, string>) {
	if (!active || !payload || payload.length === 0) {
		return null;
	}
	const total = payload.reduce((sum, p) => sum + (typeof p.value === 'number' ? p.value : 0), 0);
	return (
		<div className='rounded-md border border-border bg-background shadow-lg p-3 text-xs min-w-[180px]'>
			<div className='font-medium mb-2'>{label}</div>
			<div className='space-y-1'>
				{payload.map((p) => (
					<div key={String(p.dataKey)} className='flex items-center gap-2'>
						<span
							className='size-2 rounded-full shrink-0'
							style={{ backgroundColor: p.color }}
						/>
						<span className='text-muted-foreground'>{p.name}</span>
						<span className='font-mono ml-auto'>
							{(typeof p.value === 'number' ? p.value : 0).toLocaleString()}
						</span>
					</div>
				))}
				<div className='border-t border-border pt-1 mt-1 flex items-center gap-2'>
					<span className='font-medium'>Total</span>
					<span className='font-mono ml-auto font-semibold'>
						{total.toLocaleString()}
					</span>
				</div>
			</div>
		</div>
	);
}

function formatBucket(iso: string | null | undefined, granularity: UsageGranularity): string {
	if (!iso) return '—';
	const d = new Date(iso);
	switch (granularity) {
		case 'hour':
			return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric' });
		case 'day':
			return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
		case 'month':
			return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
	}
}
