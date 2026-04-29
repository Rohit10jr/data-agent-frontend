import { useState, useEffect } from 'react';
import { useForm } from '@tanstack/react-form';
import { ChevronDown } from 'lucide-react';
import { USER_ROLES } from '@nao/shared/types';
import type { UserRole } from '@nao/shared/types';

import type { TeamMember } from './types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface EditMemberDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	member: TeamMember | null;
	isAdmin: boolean;
	availableRoles?: readonly UserRole[];
	onSubmit: (data: {
		userId: string;
		firstName?: string;
		lastName?: string;
		newRole?: UserRole;
	}) => Promise<void>;
}

export function EditMemberDialog({
	open,
	onOpenChange,
	member,
	isAdmin,
	availableRoles = USER_ROLES,
	onSubmit,
}: EditMemberDialogProps) {
	const [error, setError] = useState('');

	const form = useForm({
		defaultValues: {
			firstName: member?.firstName ?? '',
			lastName: member?.lastName ?? '',
			role: member?.role ?? 'user',
		},
		onSubmit: async ({ value }) => {
			if (!member) {
				return;
			}
			setError('');
			try {
				await onSubmit({
					userId: member.id,
					firstName: value.firstName,
					lastName: value.lastName,
					newRole: value.role,
				});
				onOpenChange(false);
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			}
		},
	});

	useEffect(() => {
		if (open && member) {
			form.reset();
			form.setFieldValue('firstName', member.firstName ?? '');
			form.setFieldValue('lastName', member.lastName ?? '');
			form.setFieldValue('role', member.role);
		}
	}, [open, member, form]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit Profile</DialogTitle>
				</DialogHeader>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className='flex flex-col gap-4'
				>
					<div className='flex gap-3'>
						<form.Field name='firstName'>
							{(field) => (
								<div className='flex flex-col gap-2 flex-1'>
									<label htmlFor='edit-member-firstname' className='text-sm font-medium'>
										First name
									</label>
									<Input
										id='edit-member-firstname'
										type='text'
										placeholder='First name'
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
									/>
								</div>
							)}
						</form.Field>

						<form.Field name='lastName'>
							{(field) => (
								<div className='flex flex-col gap-2 flex-1'>
									<label htmlFor='edit-member-lastname' className='text-sm font-medium'>
										Last name
									</label>
									<Input
										id='edit-member-lastname'
										type='text'
										placeholder='Last name'
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
									/>
								</div>
							)}
						</form.Field>
					</div>

					{isAdmin && (
						<form.Field name='role'>
							{(field) => (
								<div className='flex flex-col gap-2'>
									<label htmlFor='edit-member-role' className='text-sm font-medium'>
										Role
									</label>
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button variant='outline' className='w-full justify-between'>
												<span className='capitalize'>{field.state.value}</span>
												<ChevronDown className='h-4 w-4 opacity-50' />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align='start' className='w-full'>
											{availableRoles.map((role) => (
												<DropdownMenuItem
													key={role}
													onClick={() => field.handleChange(role)}
													className={field.state.value === role ? 'bg-accent' : ''}
												>
													<span className='capitalize'>{role}</span>
												</DropdownMenuItem>
											))}
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							)}
						</form.Field>
					)}

					{error && <p className='text-red-500 text-center text-sm'>{error}</p>}
					<div className='flex justify-end'>
						<Button type='submit'>Save changes</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
