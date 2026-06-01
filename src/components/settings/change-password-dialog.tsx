import { useEffect, useState } from 'react';
import { useForm } from '@tanstack/react-form';

import { changePassword } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface ChangePasswordDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
	const [serverError, setServerError] = useState<string | undefined>();
	const [isSubmitting, setIsSubmitting] = useState(false);

	const form = useForm({
		defaultValues: { oldPassword: '', newPassword: '', confirmPassword: '' },
		onSubmit: async ({ value }) => {
			if (value.oldPassword === value.newPassword) {
				setServerError('New password must be different from the current one.');
				return;
			}
			if (value.newPassword !== value.confirmPassword) {
				setServerError('New passwords do not match.');
				return;
			}
			setServerError(undefined);
			setIsSubmitting(true);
			const { error } = await changePassword({
				oldPassword: value.oldPassword,
				newPassword: value.newPassword,
				confirmPassword: value.confirmPassword,
			});
			setIsSubmitting(false);
			if (error) {
				setServerError(error.message);
				return;
			}
			onOpenChange(false);
		},
	});

	useEffect(() => {
		if (!open) {
			form.reset();
			setServerError(undefined);
		}
	}, [open, form]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Change password</DialogTitle>
				</DialogHeader>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className='flex flex-col gap-4'
				>
					<form.Field name='oldPassword'>
						{(field) => (
							<div className='flex flex-col gap-2'>
								<label htmlFor='change-password-old' className='text-sm font-medium'>
									Current password
								</label>
								<Input
									id='change-password-old'
									type='password'
									autoComplete='current-password'
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
									required
								/>
							</div>
						)}
					</form.Field>

					<form.Field name='newPassword'>
						{(field) => (
							<div className='flex flex-col gap-2'>
								<label htmlFor='change-password-new' className='text-sm font-medium'>
									New password
								</label>
								<Input
									id='change-password-new'
									type='password'
									autoComplete='new-password'
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
									required
								/>
							</div>
						)}
					</form.Field>

					<form.Field name='confirmPassword'>
						{(field) => (
							<div className='flex flex-col gap-2'>
								<label htmlFor='change-password-confirm' className='text-sm font-medium'>
									Confirm new password
								</label>
								<Input
									id='change-password-confirm'
									type='password'
									autoComplete='new-password'
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
									required
								/>
							</div>
						)}
					</form.Field>

					{serverError && <p className='text-sm text-destructive text-center'>{serverError}</p>}

					<div className='flex justify-end gap-2'>
						<Button
							type='button'
							variant='ghost'
							onClick={() => onOpenChange(false)}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button type='submit' disabled={isSubmitting}>
							{isSubmitting ? 'Updating…' : 'Update password'}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
