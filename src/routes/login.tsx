import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useForm } from '@tanstack/react-form';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { signIn } from '@/lib/auth-client';
import { AuthForm, FormTextField } from '@/components/auth-form';

export const Route = createFileRoute('/login')({
	validateSearch: (search: Record<string, unknown>) => ({
		error: typeof search.error === 'string' ? search.error : undefined,
	}),
	component: Login,
});

function Login() {
	const navigate = useNavigate();
	const qc = useQueryClient();
	const { error: oauthError } = Route.useSearch();
	const [serverError, setServerError] = useState<string | undefined>(oauthError);
	const [unverifiedEmail, setUnverifiedEmail] = useState<string | undefined>();

	const form = useForm({
		defaultValues: { email: '', password: '' },
		onSubmit: async ({ value }) => {
			setServerError(undefined);
			setUnverifiedEmail(undefined);
			await signIn.email(value, {
				onSuccess: async () => {
					// Refetch session with the new token before navigating, otherwise
					// the route guard sees the stale "logged out" cache and bounces
					// us back to /signup (because user.countAll is stubbed null).
					await qc.invalidateQueries({ queryKey: ['session'] });
					await qc.refetchQueries({ queryKey: ['session'] });
					navigate({ to: '/' });
				},
				onError: (err) => {
					setServerError(err.error.message);
					// Detect Django's "Email not verified." response and offer to resend.
					if (err.error.message.toLowerCase().includes('email not verified')) {
						setUnverifiedEmail(value.email);
					}
				},
			});
		},
	});

	return (
		<AuthForm
			form={form}
			title='Log In'
			submitText='Log In'
			serverError={serverError}
			displaySocialProviders={true}
			footer={
				<>
					Don&apos;t have an account?{' '}
					<Link
						to='/signup'
						search={{ error: undefined }}
						className='text-foreground underline underline-offset-4'
					>
						Sign up
					</Link>
				</>
			}
		>
			<FormTextField form={form} name='email' type='email' placeholder='Email' />
			<FormTextField form={form} name='password' type='password' placeholder='Password' />

			{unverifiedEmail && (
				<div className='text-sm text-center text-muted-foreground'>
					Need a new verification link?{' '}
					<Link
						to='/verify-email-sent'
						search={{ email: unverifiedEmail }}
						className='text-foreground underline underline-offset-4'
					>
						Resend
					</Link>
				</div>
			)}

			<div className='text-right'>
				<Link to='/forgot-password' className='text-sm underline underline-offset-4'>
					Forgot password?
				</Link>
			</div>
		</AuthForm>
	);
}
