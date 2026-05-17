// Django JWT-backed replacement for better-auth.
// Exports match the better-auth API surface so existing call sites (login.tsx,
// signup.tsx, useSession consumers) keep working unchanged.

import { useQuery } from '@tanstack/react-query';

import { api, ApiError } from './api';
import { tokens } from './tokens';

export interface SessionUser {
	id: number;
	email: string;
	name: string;
	firstName: string;
	lastName: string;
}

interface DjangoLoginResponse {
	success: boolean;
	message: string;
	refresh: string;
	access: string;
	user: { email: string; first_name: string; last_name: string };
}

interface DjangoWhoami {
	id: number;
	email: string;
	first_name: string;
	last_name: string;
}

const toSessionUser = (u: DjangoWhoami): SessionUser => ({
	id: u.id,
	email: u.email,
	firstName: u.first_name,
	lastName: u.last_name,
	name: `${u.first_name} ${u.last_name}`.trim() || u.email,
});

// Better-auth callback shape: { onSuccess, onError } where onError receives
// { error: { message: string } }. We preserve that here.
interface Callbacks {
	onSuccess?: (ctx: { data: unknown }) => void;
	onError?: (ctx: { error: { message: string } }) => void;
}

const extractErrorMessage = (err: unknown): string => {
	if (err instanceof ApiError) {
		const body = err.body as Record<string, unknown> | null;
		if (body?.detail) return String(body.detail);
		if (body?.message) return String(body.message);
		if (body?.errors) {
			// DRF-style field errors: { errors: { email: ["already exists"] } }
			const errors = body.errors as Record<string, string[]>;
			const first = Object.values(errors)[0];
			if (Array.isArray(first) && first.length) return first[0];
		}
		return err.message;
	}
	return err instanceof Error ? err.message : 'Unknown error';
};

// ── signIn ────────────────────────────────────────────────────────────
export const signIn = {
	email: async (
		values: { email: string; password: string },
		callbacks?: Callbacks,
	): Promise<void> => {
		try {
			const data = await api.post<DjangoLoginResponse>('/token/', values);
			tokens.set({ access: data.access, refresh: data.refresh });
			callbacks?.onSuccess?.({ data });
		} catch (err) {
			callbacks?.onError?.({ error: { message: extractErrorMessage(err) } });
		}
	},
	// Social sign-in stub — Django doesn't have OAuth yet.
	social: async (_opts: { provider: string; callbackURL?: string; errorCallbackURL?: string }) => {
		console.warn('[auth] Social sign-in not implemented for Django backend');
	},
};

// ── signUp ────────────────────────────────────────────────────────────
interface SignUpValues {
	email: string;
	password: string;
	confirmPassword?: string;
	firstName: string;
	lastName: string;
}

export const signUp = {
	email: async (values: SignUpValues, callbacks?: Callbacks): Promise<void> => {
		try {
			const data = await api.post('/signup/', {
				email: values.email,
				first_name: values.firstName,
				last_name: values.lastName,
				password1: values.password,
				password2: values.confirmPassword ?? values.password,
			});
			callbacks?.onSuccess?.({ data });
		} catch (err) {
			callbacks?.onError?.({ error: { message: extractErrorMessage(err) } });
		}
	},
};

// ── Email verification ────────────────────────────────────────────────
interface VerifyEmailResponse {
	success: boolean;
	message: string;
}

/**
 * Calls Django /api/email/verify/. On success the email is marked verified
 * server-side; the caller then shows a "log in now" CTA. We deliberately do
 * NOT auto-log-in — the user may have opened the verification link on a
 * different device from the one they want to use the app on.
 */
export const verifyEmail = (
	uid: string,
	token: string,
): Promise<VerifyEmailResponse> =>
	api.post<VerifyEmailResponse>('/email/verify/', { uid, token });

export const resendVerification = (email: string) =>
	api.post<{ message: string }>('/email/verify/resend/', { email });

// ── Profile update ────────────────────────────────────────────────────
interface UpdateProfileResponse {
	user: { id: number; email: string; first_name: string; last_name: string };
	message: string;
}

/**
 * PUT /api/update-profile/ — change first / last name. Requires auth.
 */
export const updateProfile = async (input: {
	firstName?: string;
	lastName?: string;
}): Promise<UpdateProfileResponse> => {
	return api.put<UpdateProfileResponse>('/update-profile/', {
		first_name: input.firstName,
		last_name: input.lastName,
	});
};

// ── signOut ───────────────────────────────────────────────────────────
// Accepts better-auth's `{ fetchOptions: { onSuccess, onError } }` shape so
// existing callers (e.g. account settings logout button) keep working unchanged.
interface SignOutOptions {
	fetchOptions?: {
		onSuccess?: () => void;
		onError?: (err: unknown) => void;
	};
}

export const signOut = async (options?: SignOutOptions): Promise<void> => {
	const refresh = tokens.getRefresh();
	try {
		if (refresh) {
			// POST /api/logout/ with { refresh } — Django blacklists the refresh token.
			await api.post('/logout/', { refresh });
		}
		tokens.clear();
		options?.fetchOptions?.onSuccess?.();
	} catch (err) {
		// Even if the server call fails, clear local tokens so the user is logged out client-side.
		tokens.clear();
		options?.fetchOptions?.onError?.(err);
	}
};

// ── password reset (stubs — wire up later) ────────────────────────────
export const requestPasswordReset = async (values: { email: string }) => {
	return api.post<{ message: string }>('/password/reset/', { email: values.email });
};

export const resetPassword = async (_values: { newPassword: string; token: string }) => {
	console.warn('[auth] resetPassword requires uid+token — wire up the /reset-password page later');
	return { message: 'Not implemented' };
};

// ── useSession ────────────────────────────────────────────────────────
// Returns { data: { user } | null, isPending, ... } — same shape as
// better-auth's useSession so existing call sites (`session.data.user.name`)
// keep working without edits.
interface SessionEnvelope {
	user: SessionUser;
}

export function useSession() {
	return useQuery<SessionEnvelope | null>({
		queryKey: ['session'],
		queryFn: async () => {
			if (!tokens.getAccess()) return null;
			try {
				const me = await api.get<DjangoWhoami>('/whoami/');
				return { user: toSessionUser(me) };
			} catch (err) {
				if (err instanceof ApiError && err.status === 401) return null;
				throw err;
			}
		},
		staleTime: 60_000,
		retry: false,
	});
}

// ── Social sign-in stubs (kept for import compatibility) ──────────────
export const handleGoogleSignIn = async () => {
	console.warn('[auth] Google sign-in not implemented for Django backend');
};

export const handleGithubSignIn = async () => {
	console.warn('[auth] GitHub sign-in not implemented for Django backend');
};

// ── Compat: some places import `authClient` as an object ──────────────
export const authClient = {
	signIn,
	signUp,
	signOut,
	useSession,
	requestPasswordReset,
	resetPassword,
};
