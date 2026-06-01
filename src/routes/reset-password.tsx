import { createFileRoute, Link } from '@tanstack/react-router';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { resetPassword } from '@/lib/auth-client';
import { AuthForm, FormTextField } from '@/components/auth-form';
import { useRedirectIfSmtpNotSetup } from '@/hooks/useRedirectIfSmtpNotSetup';

export const Route = createFileRoute('/reset-password')({
	validateSearch: (search: Record<string, unknown>) => ({
		uid: typeof search.uid === 'string' ? search.uid : undefined,
		token: typeof search.token === 'string' ? search.token : undefined,
		error: typeof search.error === 'string' ? search.error : undefined,
	}),
	component: ResetPassword,
});

function ResetPassword() {
	const isPending = useRedirectIfSmtpNotSetup();
	const { uid, token, error: tokenError } = Route.useSearch();
	const [serverError, setServerError] = useState<string | undefined>();
	const [success, setSuccess] = useState(false);

	const form = useForm({
		defaultValues: { newPassword: '', confirmPassword: '' },
		onSubmit: async ({ value }) => {
			if (value.newPassword !== value.confirmPassword) {
				setServerError('Passwords do not match.');
				return;
			}
			setServerError(undefined);
			const { error } = await resetPassword({
				uid: uid!,
				token: token!,
				newPassword: value.newPassword,
				confirmPassword: value.confirmPassword,
			});
			if (error) {
				setServerError(error.message);
			} else {
				setSuccess(true);
			}
		},
	});

	if (isPending) {
		return null;
	}

	if (tokenError === 'INVALID_TOKEN' || !token || !uid) {
		return (
			<div className='mx-auto w-full max-w-md p-8 my-auto text-center'>
				<h1 className='text-2xl font-semibold mb-4'>Invalid or expired link</h1>
				<p className='text-muted-foreground mb-6'>
					This password reset link is no longer valid. Please request a new one.
				</p>
				<Link to='/forgot-password' className='text-sm underline underline-offset-4'>
					Request a new link
				</Link>
			</div>
		);
	}

	if (success) {
		return (
			<div className='mx-auto w-full max-w-md p-8 my-auto text-center'>
				<h1 className='text-2xl font-semibold mb-4'>Password changed</h1>
				<p className='text-muted-foreground mb-6'>
					Your password has been updated. Please sign in with your new password.
				</p>
				<Link
					to='/login'
					search={{ error: undefined }}
					className='text-sm underline underline-offset-4'
				>
					Go to login
				</Link>
			</div>
		);
	}

	return (
		<AuthForm form={form} title='Reset password' submitText='Set new password' serverError={serverError}>
			<FormTextField form={form} name='newPassword' type='password' placeholder='New password' />
			<FormTextField form={form} name='confirmPassword' type='password' placeholder='Confirm new password' />
		</AuthForm>
	);
}
