import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { signUp } from '@/lib/auth-client';
import { AuthForm, FormTextField } from '@/components/auth-form';

export const Route = createFileRoute('/signup')({
	validateSearch: (search: Record<string, unknown>) => ({
		error: typeof search.error === 'string' ? search.error : undefined,
	}),
	component: SignUp,
});

function SignUp() {
	const navigate = useNavigate();
	const { error: oauthError } = Route.useSearch();
	const [serverError, setServerError] = useState<string | undefined>(oauthError);

	const form = useForm({
		defaultValues: {
			firstName: '',
			lastName: '',
			email: '',
			password: '',
			confirmPassword: '',
		},
		onSubmit: async ({ value }) => {
			setServerError(undefined);

			if (value.password !== value.confirmPassword) {
				setServerError('Passwords do not match.');
				return;
			}

			await signUp.email(value, {
				onSuccess: () => {
					navigate({
						to: '/verify-email-sent',
						search: { email: value.email },
					});
				},
				onError: (err) => setServerError(err.error.message),
			});
		},
	});

	return (
		<AuthForm
			form={form}
			title='Sign Up'
			submitText='Sign Up'
			serverError={serverError}
			displaySocialProviders={true}
			footer={
				<>
					Already have an account?{' '}
					<Link
						to='/login'
						search={{ error: undefined }}
						className='text-foreground underline underline-offset-4'
					>
						Log in
					</Link>
				</>
			}
		>
			<div className='flex gap-3'>
				<FormTextField form={form} name='firstName' placeholder='First name' />
				<FormTextField form={form} name='lastName' placeholder='Last name' />
			</div>
			<FormTextField form={form} name='email' type='email' placeholder='Email' />
			<FormTextField form={form} name='password' type='password' placeholder='Password' />
			<FormTextField form={form} name='confirmPassword' type='password' placeholder='Confirm password' />
		</AuthForm>
	);
}
