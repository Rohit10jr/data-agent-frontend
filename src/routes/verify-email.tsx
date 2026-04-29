import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { verifyEmail, resendVerification } from '@/lib/auth-client';
import { ApiError } from '@/lib/api';
import NaoLogo from '@/components/icons/nao-full-logo.svg';

type VerifyState = 'verifying' | 'success' | 'error';

export const Route = createFileRoute('/verify-email')({
	validateSearch: (search: Record<string, unknown>) => ({
		uid: typeof search.uid === 'string' ? search.uid : '',
		token: typeof search.token === 'string' ? search.token : '',
	}),
	component: VerifyEmail,
});

function VerifyEmail() {
	const { uid, token } = Route.useSearch();
	const navigate = useNavigate();
	const qc = useQueryClient();
	const [state, setState] = useState<VerifyState>('verifying');
	const [errorMessage, setErrorMessage] = useState<string>('');
	const ranOnce = useRef(false);

	// Resend form state
	const [resendEmail, setResendEmail] = useState('');
	const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
	const [resendError, setResendError] = useState<string>('');

	useEffect(() => {
		if (ranOnce.current) return;
		ranOnce.current = true;

		if (!uid || !token) {
			setState('error');
			setErrorMessage('Missing verification parameters in the URL.');
			return;
		}

		verifyEmail(uid, token)
			.then(() => {
				setState('success');
				// Refresh the session so route guards pick up the new login state.
				qc.invalidateQueries({ queryKey: ['session'] });
				// Brief pause so the user sees the success message, then drop them in.
				setTimeout(() => navigate({ to: '/' }), 1200);
			})
			.catch((err) => {
				setState('error');
				setErrorMessage(
					err instanceof ApiError ? err.message : 'Verification failed. Please try again.',
				);
			});
	}, [uid, token, navigate, qc]);

	const handleResend = async () => {
		if (!resendEmail) {
			setResendState('error');
			setResendError('Enter your email to resend.');
			return;
		}
		setResendState('sending');
		setResendError('');
		try {
			await resendVerification(resendEmail);
			setResendState('sent');
		} catch (err) {
			setResendState('error');
			setResendError(err instanceof ApiError ? err.message : 'Failed to resend.');
		}
	};

	return (
		<div className='mx-auto w-full max-w-md p-8 my-auto'>
			<div className='flex flex-row items-end mb-8'>
				<NaoLogo className='w-20 h-auto' />
				<span className='text-muted-foreground text-sm mx-4 border-l-1 border-border h-4'></span>
				<h1 className='text-md font-semibold uppercase leading-none'>
					{state === 'verifying' && 'Verifying'}
					{state === 'success' && 'Verified'}
					{state === 'error' && 'Verification Failed'}
				</h1>
			</div>

			{state === 'verifying' && (
				<p className='text-sm text-muted-foreground'>Verifying your email…</p>
			)}

			{state === 'success' && (
				<div className='space-y-3'>
					<p className='text-sm text-muted-foreground'>
						Email verified. Signing you in…
					</p>
				</div>
			)}

			{state === 'error' && (
				<div className='space-y-6'>
					<p className='text-red-500 text-sm'>{errorMessage}</p>

					<div className='space-y-3'>
						<p className='text-sm text-muted-foreground'>
							The link may have expired. Enter your email to send a new one.
						</p>
						<input
							type='email'
							value={resendEmail}
							onChange={(e) => setResendEmail(e.target.value)}
							placeholder='Email'
							className='w-full h-12 px-3 rounded-md border border-border bg-background text-base'
						/>
						<Button
							type='button'
							variant='outline'
							className='w-full h-11'
							onClick={handleResend}
							disabled={resendState === 'sending' || resendState === 'sent'}
						>
							{resendState === 'sending' && 'Sending…'}
							{resendState === 'sent' && 'Sent — check your inbox'}
							{(resendState === 'idle' || resendState === 'error') &&
								'Send a new verification email'}
						</Button>
						{resendState === 'error' && (
							<p className='text-red-500 text-sm text-center'>{resendError}</p>
						)}
					</div>

					<div className='text-center text-sm text-muted-foreground'>
						<Link
							to='/login'
							search={{ error: undefined }}
							className='text-foreground underline underline-offset-4'
						>
							Back to log in
						</Link>
					</div>
				</div>
			)}
		</div>
	);
}
