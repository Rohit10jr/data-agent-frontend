import { tokens } from './tokens';
import { API_BASE } from './config';

export class ApiError extends Error {
	constructor(public status: number, public body: unknown) {
		const msg =
			(body as { detail?: string })?.detail ||
			(body as { message?: string })?.message ||
			`HTTP ${status}`;
		super(msg);
	}
}

// Single-flight guard so concurrent 401s don't fire N refresh calls.
let refreshing: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
	if (refreshing) return refreshing;
	refreshing = (async () => {
		const refresh = tokens.getRefresh();
		if (!refresh) return false;
		try {
			const res = await fetch(`${API_BASE}/token/refresh/`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ refresh }),
			});
			if (!res.ok) return false;
			const data = (await res.json()) as { access: string; refresh?: string };
			tokens.set({ access: data.access, refresh: data.refresh });
			return true;
		} catch {
			return false;
		} finally {
			refreshing = null;
		}
	})();
	return refreshing;
}

async function request<T>(
	method: string,
	path: string,
	body?: unknown,
	retry = true,
): Promise<T> {
	const access = tokens.getAccess();
	const res = await fetch(`${API_BASE}${path}`, {
		method,
		headers: {
			...(body ? { 'Content-Type': 'application/json' } : {}),
			...(access ? { Authorization: `Bearer ${access}` } : {}),
		},
		body: body ? JSON.stringify(body) : undefined,
	});

	if (res.status === 401 && retry && tokens.getRefresh()) {
		const ok = await refreshAccessToken();
		if (ok) return request<T>(method, path, body, false);
		tokens.clear();
	}

	if (!res.ok) {
		const errBody = await res.json().catch(() => null);
		throw new ApiError(res.status, errBody);
	}
	if (res.status === 204) return undefined as T;
	return res.json();
}

export const api = {
	get: <T>(p: string) => request<T>('GET', p),
	post: <T>(p: string, b?: unknown) => request<T>('POST', p, b),
	put: <T>(p: string, b: unknown) => request<T>('PUT', p, b),
	patch: <T>(p: string, b: unknown) => request<T>('PATCH', p, b),
	delete: <T>(p: string) => request<T>('DELETE', p),
};
