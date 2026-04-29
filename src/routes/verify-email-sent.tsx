import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { resendVerification } from '@/lib/auth-client';
import { ApiError } from '@/lib/api';
import NaoLogo from '@/components/icons/nao-full-logo.svg';

export const Route = createFileRoute('/verify-email-sent')({
	validateSearch: (search: Record<string, unknown>) => ({
		email: typeof search.email === 'string' ? search.email : '',
	}),
	component: VerifyEmailSent,
});

function VerifyEmailSent() {
	const { email } = Route.useSearch();
	const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
	const [resendError, setResendError] = useState<string | undefined>();

	const handleResend = async () => {
		if (!email) {
			setResendState('error');
			setResendError('No email on record. Please sign up again.');
			return;
		}
		setResendState('sending');
		setResendError(undefined);
		try {
			await resendVerification(email);
			setResendState('sent');
		} catch (err) {
			setResendState('error');
			setResendError(
				err instanceof ApiError ? err.message : 'Failed to resend. Try again later.',
			);
		}
	};

	return (
		<div className='mx-auto w-full max-w-md p-8 my-auto'>
			<div className='flex flex-row items-end mb-8'>
				<NaoLogo className='w-20 h-auto' />
				<span className='text-muted-foreground text-sm mx-4 border-l-1 border-border h-4'></span>
				<h1 className='text-md font-semibold uppercase leading-none'>Check Your Email</h1>
			</div>

			<div className='space-y-4 text-sm text-muted-foreground'>
				<p>
					We sent a verification link to{' '}
					<span className='font-medium text-foreground'>{email || 'your email address'}</span>.
				</p>
				<p>
					Click the link in that email to finish creating your account. The link expires shortly,
					so check your inbox now.
				</p>
				<p className='text-xs'>
					Didn&apos;t get the email? Check your spam folder or click below to resend.
				</p>
			</div>

			<div className='mt-6 space-y-3'>
				<Button
					type='button'
					variant='outline'
					className='w-full h-11'
					onClick={handleResend}
					disabled={resendState === 'sending' || resendState === 'sent'}
				>
					{resendState === 'sending' && 'Sending…'}
					{resendState === 'sent' && 'Email sent — check your inbox'}
					{(resendState === 'idle' || resendState === 'error') && 'Resend verification email'}
				</Button>

				{resendState === 'error' && resendError && (
					<p className='text-red-500 text-center text-sm'>{resendError}</p>
				)}
			</div>

			<div className='mt-6 text-center text-sm text-muted-foreground'>
				Already verified?{' '}
				<Link
					to='/login'
					search={{ error: undefined }}
					className='text-foreground underline underline-offset-4'
				>
					Log in
				</Link>
			</div>
		</div>
	);
}
