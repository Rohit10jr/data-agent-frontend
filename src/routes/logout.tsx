import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { signOut } from '@/lib/auth-client';
import NaoLogo from '@/components/icons/nao-logo.svg';

export const Route = createFileRoute('/logout')({
	component: LogoutPage,
});

function LogoutPage() {
	const navigate = useNavigate();
	const qc = useQueryClient();
	const ranOnce = useRef(false);

	useEffect(() => {
		if (ranOnce.current) return;
		ranOnce.current = true;

		(async () => {
			// Wipe React-Query cache (chats, session, everything).
			qc.clear();
			// Hit Django /api/logout/ with refresh token, then clear localStorage tokens.
			await signOut({
				fetchOptions: {
					onSuccess: () => navigate({ to: '/login', search: { error: undefined } }),
					onError: () => navigate({ to: '/login', search: { error: undefined } }),
				},
			});
		})();
	}, [navigate, qc]);

	return (
		<div className='mx-auto w-full max-w-md p-8 my-auto'>
			<div className='flex flex-row items-end mb-8'>
				<NaoLogo className='h-8 w-auto' />
				<span className='text-muted-foreground text-sm mx-4 border-l-1 border-border h-4'></span>
				<h1 className='text-md font-semibold uppercase leading-none'>Logging out</h1>
			</div>
			<p className='text-sm text-muted-foreground'>Signing you out…</p>
		</div>
	);
}
