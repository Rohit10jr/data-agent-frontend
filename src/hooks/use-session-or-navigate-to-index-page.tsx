import { useEffect } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';

import { useSession } from '@/lib/auth-client';
import { useAuthRoute } from '@/hooks/use-auth-route';

// Routes anyone (logged in or not) can reach — auth flows that must work
// without a session.
const AUTH_ROUTES = [
	'/login',
	'/signup',
	'/forgot-password',
	'/reset-password',
	'/verify-email',
	'/verify-email-sent',
	'/logout',
];

export const useSessionOrNavigateToIndexPage = () => {
	const navigate = useNavigate();
	const session = useSession();
	const navigation = useAuthRoute();
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	useEffect(() => {
		if (session.isPending) return;

		const isAuthRoute = AUTH_ROUTES.includes(pathname);

		// Not logged in + on a protected route → send to /login.
		if (!session.data && !isAuthRoute) {
			navigate({ to: navigation });
			return;
		}

		// Logged in + on /login or /signup → send to home.
		if (session.data && (pathname === '/login' || pathname === '/signup')) {
			navigate({ to: '/' });
		}
	}, [session.isPending, session.data, navigate, navigation, pathname]);

	return session;
};
