import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
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
	{ value: 'year', label: 'Year' },
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
										{granularity === 'year' && 'Last 5 years'}
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

// ── Bar chart (pure CSS, no chart library) ────────────────────────────
function UsageBarChart({
	buckets,
	granularity,
}: {
	buckets: UsageBucket[];
	granularity: UsageGranularity;
}) {
	if (buckets.length === 0) {
		return (
			<div className='flex items-center justify-center h-48 text-sm text-muted-foreground'>
				No usage in this window yet.
			</div>
		);
	}

	const max = Math.max(...buckets.map((b) => b.total_tokens), 1);
	const totalInWindow = buckets.reduce((sum, b) => sum + b.total_tokens, 0);

	return (
		<div className='space-y-3'>
			<div className='flex items-end gap-1 h-48 border-b border-border pb-1'>
				{buckets.map((b, i) => {
					const heightPct = (b.total_tokens / max) * 100;
					return (
						<div
							key={i}
							className='flex-1 min-w-0 flex flex-col items-center justify-end group'
						>
							<div className='w-full text-[10px] text-center text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity tabular-nums mb-1'>
								{b.total_tokens.toLocaleString()}
							</div>
							<div
								className='w-full rounded-t bg-foreground/80 hover:bg-foreground transition-colors min-h-[1px]'
								style={{ height: `${heightPct}%` }}
								title={`${formatBucket(b.bucket, granularity)} — ${b.total_tokens.toLocaleString()} tokens (${b.input_tokens.toLocaleString()} in / ${b.output_tokens.toLocaleString()} out)`}
							/>
						</div>
					);
				})}
			</div>

			<div className='flex justify-between text-[10px] text-muted-foreground'>
				<span>{formatBucket(buckets[0]?.bucket, granularity)}</span>
				<span className='font-mono'>{totalInWindow.toLocaleString()} tokens in window</span>
				<span>{formatBucket(buckets[buckets.length - 1]?.bucket, granularity)}</span>
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
		case 'year':
			return d.getFullYear().toString();
	}
}
