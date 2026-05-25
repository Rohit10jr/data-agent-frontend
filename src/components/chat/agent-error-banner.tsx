import { useEffect, useState } from 'react';
import { AlertCircle, Clock, RefreshCw, X } from 'lucide-react';
import type { AgentErrorPayload } from '@/lib/django-stream';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AgentErrorBannerProps {
	error: AgentErrorPayload;
	onRetry?: () => void;
	onDismiss?: () => void;
}

export function AgentErrorBanner({ error, onRetry, onDismiss }: AgentErrorBannerProps) {
	const countdown = useCountdown(error.retry_after_seconds);
	const showRetry = error.retryable && onRetry && countdown === 0;

	return (
		<div
			className={cn(
				'max-w-3xl mx-auto rounded-md border px-3 py-2 text-sm',
				'border-destructive/40 bg-destructive/10 text-destructive',
				'flex items-start gap-2',
			)}
			role='alert'
		>
			<AlertCircle className='size-4 mt-0.5 shrink-0' />
			<div className='flex-1 space-y-1'>
				<p>{error.message}</p>
				{countdown > 0 && (
					<p className='flex items-center gap-1.5 text-xs opacity-80'>
						<Clock className='size-3' />
						Retry in {countdown}s
					</p>
				)}
			</div>
			<div className='flex items-center gap-1 shrink-0'>
				{showRetry && (
					<Button
						type='button'
						size='sm'
						variant='outline'
						onClick={onRetry}
						className='h-7'
					>
						<RefreshCw className='size-3 mr-1' />
						Retry
					</Button>
				)}
				{onDismiss && (
					<Button
						type='button'
						size='icon-sm'
						variant='ghost'
						onClick={onDismiss}
						title='Dismiss'
						className='h-7 w-7'
					>
						<X className='size-3' />
					</Button>
				)}
			</div>
		</div>
	);
}

/** Tick down once a second from the initial value. Returns 0 once expired. */
function useCountdown(initial: number | null): number {
	const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil(initial ?? 0)));

	useEffect(() => {
		setRemaining(Math.max(0, Math.ceil(initial ?? 0)));
	}, [initial]);

	useEffect(() => {
		if (remaining <= 0) return;
		const id = setInterval(() => {
			setRemaining((r) => (r <= 1 ? 0 : r - 1));
		}, 1000);
		return () => clearInterval(id);
	}, [remaining]);

	return remaining;
}
