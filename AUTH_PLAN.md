# Auth Integration Plan — Django JWT ↔ nao Frontend

Focused plan for replacing the nao frontend's `better-auth` flow with your Django JWT backend. Everything else (chat, projects, memory) is deferred.

---

## 1. Django auth endpoints — complete reference

All 13 endpoints that exist today, with exact wire shapes taken from [core/views.py](../backend/core/views.py) and [core/serializers.py](../backend/core/serializers.py).

### 1.1 Login — `POST /api/token/`

- **Auth:** public
- **Throttle:** none
- **Request:**
  ```json
  { "email": "user@example.com", "password": "••••••••" }
  ```
- **Response 200:**
  ```json
  {
    "success": true,
    "message": "Login successful",
    "refresh": "eyJ0eXAi...<long>",
    "access":  "eyJ0eXAi...<short-lived>",
    "user": {
      "email": "user@example.com",
      "first_name": "Ada",
      "last_name":  "Lovelace"
    }
  }
  ```
- **Errors (401):**
  ```json
  { "detail": "Invalid email or password." }
  ```
  or `"Email not verified."` or `"Account is deactivated. Contact support."`

### 1.2 Refresh token — `POST /api/token/refresh/`

- **Auth:** public
- **Request:** `{ "refresh": "<refresh_token>" }`
- **Response 200:**
  ```json
  { "access": "eyJ...", "refresh": "eyJ..." }
  ```
  (both rotate — `ROTATE_REFRESH_TOKENS=True` in [settings.py:189](../backend/agent/settings.py#L189))
- **Errors (401):** `{ "detail": "Token is invalid or expired", "code": "token_not_valid" }`

### 1.3 Verify token — `POST /api/token/verify/`

- **Request:** `{ "token": "eyJ..." }`
- **Response 200:** `{}` (empty body)
- **Errors (401):** `{ "detail": "Token is invalid or expired" }`

### 1.4 Signup — `POST /api/signup/`

- **Auth:** public (throttled 5/min)
- **Request:**
  ```json
  {
    "email": "new@example.com",
    "first_name": "Ada",
    "last_name":  "Lovelace",
    "password1": "••••••••",
    "password2": "••••••••"
  }
  ```
- **Response 201:**
  ```json
  { "message": "Account created. Please check your email to verify." }
  ```
  > ⚠️ **No tokens returned.** The user must verify email before they can log in.
- **Errors (400):**
  ```json
  {
    "success": false,
    "message": "Signup failed",
    "errors": { "email": ["An account with this email already exists."] }
  }
  ```

### 1.5 Email verification — `POST /api/email/verify/`

The signup email contains a link like `https://frontend.com/verify-email?uid=<uid>&token=<token>`. Frontend reads those query params and calls:

- **Request:** `{ "uid": "Mg", "token": "c49a1b-xxxx" }`
- **Response 200:** `{ "message": "Email verified successfully." }`
- **Errors (400):** `{ "message": "Invalid or expired token." }` or `"Invalid user ID."`

### 1.6 Resend verification — `POST /api/email/verify/resend/`

- **Request:** `{ "email": "user@example.com" }`
- **Response 200:** `{ "message": "If the account exists and is not verified, a verification email has been sent." }`

### 1.7 Current user — `GET /api/whoami/`

- **Auth:** Bearer token
- **Response 200:**
  ```json
  {
    "id": 1,
    "email": "user@example.com",
    "first_name": "Ada",
    "last_name":  "Lovelace"
  }
  ```
- **Errors (401):** `{ "detail": "Given token not valid for any token type" }`

### 1.8 Update profile — `PUT /api/update-profile/`

- **Auth:** Bearer token
- **Request:** `{ "first_name": "Ada", "last_name": "Lovelace" }`
- **Response 200:**
  ```json
  {
    "user": { "id": 1, "email": "...", "first_name": "...", "last_name": "..." },
    "message": "Profile updated successfully"
  }
  ```

### 1.9 Logout — `POST /api/logout/`

- **Auth:** Bearer token
- **Request:** `{ "refresh": "<refresh_token>" }`
- **Response 200:** `{ "message": "Logged out successfully" }`
- Blacklists the refresh token so it can't be used to refresh again.

### 1.10 Forgot password — `POST /api/password/reset/`

- **Auth:** public (throttled 5/min)
- **Request:** `{ "email": "user@example.com" }`
- **Response 200:** `{ "message": "If the account exists, a password reset link has been sent." }`
- Email contains link like `https://frontend.com/reset-password?uid=<uid>&token=<token>`.

### 1.11 Validate reset token — `POST /api/password/reset/validate/`

Frontend calls this **before showing the password form** to check if the uid/token in the URL is still valid.

- **Request:** `{ "uid": "Mg", "token": "c49a1b-xxxx" }`
- **Response 200:** `{ "valid": true }`
- **Errors (400):** `{ "valid": false, "message": "Invalid or expired token." }`

### 1.12 Confirm password reset — `POST /api/password/reset/confirm/`

- **Request:**
  ```json
  {
    "uid": "Mg",
    "token": "c49a1b-xxxx",
    "password1": "••••••••",
    "password2": "••••••••"
  }
  ```
- **Response 200:** `{ "message": "Password reset successful." }`
- All the user's refresh tokens are blacklisted (forces re-login everywhere).

### 1.13 Change password (authenticated) — `POST /api/password/change/`

- **Auth:** Bearer token
- **Request:**
  ```json
  { "old_password": "old-pw", "new_password1": "new-pw", "new_password2": "new-pw" }
  ```
- **Response 200:** `{ "message": "Password changed successfully." }`
- **Errors (400):** `{ "old_password": ["Old password is incorrect."] }`

---

## 2. Gap analysis — Django vs. nao's better-auth

### Fundamental differences

| Concept | Django (SimpleJWT) | nao (Better Auth) |
|---|---|---|
| Token transport | JWT in `Authorization: Bearer <token>` header | HTTP-only session cookie (auto-sent by browser) |
| Storage | Frontend stores access + refresh (localStorage / memory) | Browser owns the cookie; no JS access |
| Session check | `GET /whoami/` + valid token | `GET /auth/get-session` + cookie |
| Refresh | Explicit `POST /token/refresh/` call | Auto-handled server-side |
| CSRF | Not applicable (JWT header auth) | Needed for cookie-based mutations |
| Login returns | `{ access, refresh, user }` | Sets cookie, returns user |
| Signup returns | message only — **email verification required before login** | Either auto-login or verify flow |

### nao frontend calls you need to replace

From the grep inventory ([MIGRATION.md §1a-1b](MIGRATION.md)):

| nao frontend call | Django endpoint | Shape translation needed? |
|---|---|---|
| `POST /api/auth/sign-up/email` | `POST /api/signup/` | ✅ yes — field renames |
| `POST /api/auth/sign-in/email` | `POST /api/token/` | ✅ yes — response shape differs |
| `POST /api/auth/sign-out` | `POST /api/logout/` | ✅ yes — needs refresh token in body |
| `GET /api/auth/get-session` | `GET /api/whoami/` | ✅ yes — wrap in `{ user, session }` |
| `POST /api/auth/forget-password` | `POST /api/password/reset/` | ✅ yes |
| `POST /api/auth/reset-password` | `POST /api/password/reset/confirm/` | ✅ yes |
| `trpc.account.modifyPassword` | `POST /api/password/change/` | ✅ yes |
| `trpc.user.countAll` | (needs new Django endpoint) | ❌ build it |

### Missing on Django today (small additions)

- **`/api/nao/users/count/`** — one-line view: `return JsonResponse({'count': User.objects.count()})`. Used by first-run setup screen. Can stub to `{ count: 1 }` if you don't care about the setup flow.

### Missing on Django (email verification UX)

Django ships signup with email verification, but the verification URL in [views.py:111](../backend/core/views.py#L111) hardcodes `https://frontend.com/verify-email`. That page doesn't exist in nao's frontend. **You'll need to build it** — a new `/verify-email` route that reads `uid` + `token` from the query string and calls `POST /api/email/verify/`.

Same story for forgot password (`/reset-password?uid=&token=`).

---

## 3. Architectural decisions (auth-specific)

### Decision A — Token storage

**Options:**
- **(a1) `localStorage`** — simplest, survives reload, but vulnerable to XSS.
- **(a2) `sessionStorage`** — survives only within tab.
- **(a3) In-memory only** — most secure; user has to log in on every refresh.
- **(a4) HTTP-only cookie** (set by Django) — secure, but requires CORS + CSRF config changes.

**Recommendation: `localStorage` for now.**
- Standard JWT pattern in React apps.
- Your app isn't yet handling sensitive PII that would demand (a4).
- Easy to upgrade to cookies later if needed.
- Pair with XSS hygiene (no `dangerouslySetInnerHTML` of user content — already true in nao's frontend).

### Decision B — Refresh strategy

**Choice:** Reactive refresh on 401.

Flow:
1. Every request sends `Authorization: Bearer <access>`.
2. If Django returns 401 with `code: token_not_valid`:
   - Call `POST /api/token/refresh/` with the stored refresh token.
   - Store new access (and new refresh — they rotate).
   - Retry the original request once.
3. If refresh also returns 401 → clear tokens, redirect to `/login`.

Single-flight guard: if multiple requests all 401 at once, queue them behind one refresh call so we don't spam the refresh endpoint.

### Decision C — Where to adapt response shapes

Two options:
- **(c1)** Add Django adapter views under `/api/nao/auth/*` returning nao-shaped bodies.
- **(c2)** Transform shapes on the frontend in a thin wrapper.

**Recommendation: (c2) — transform on frontend.** Your Django auth is already clean and reusable; don't duplicate endpoints. Frontend's `auth.ts` has light mappers: `loginResponse → nao-session-shape`.

### Decision D — CORS & CSRF

- **CORS:** Django must allow `http://localhost:3000` during dev. Currently `django-cors-headers` is commented out in [settings.py:55](../backend/agent/settings.py#L55). **Re-enable it.**
- **CSRF:** Not needed for the JWT header auth path — CSRF protects cookie-based auth. Django's `CsrfViewMiddleware` is still in MIDDLEWARE but DRF's JWT auth path doesn't trigger CSRF. Fine as-is.

### Decision E — Email verification UX flow

**Choice:** build two new routes in the frontend:
- `/verify-email?uid=&token=` — reads params, calls `/api/email/verify/`, shows success/fail
- `/reset-password?uid=&token=` — validates first (`/password/reset/validate/`), shows form if valid, submits to `/password/reset/confirm/`

Nao's existing `forgot-password.tsx` can be adapted — it's already there.

---

## 4. Implementation plan

### Phase A — Django prep (30 minutes)

1. **Enable CORS.** In [settings.py](../backend/agent/settings.py):
   ```python
   INSTALLED_APPS = [
       # ...
       "corsheaders",   # ← add
       # ...
   ]

   MIDDLEWARE = [
       "corsheaders.middleware.CorsMiddleware",   # ← add at the top
       # ...existing middleware...
   ]

   CORS_ALLOWED_ORIGINS = [
       "http://localhost:3000",
       "http://127.0.0.1:3000",
   ]
   CORS_ALLOW_CREDENTIALS = True
   ```
   Install: `uv add django-cors-headers` (or `pip install`).

2. **Update the signup/reset email links.** In [views.py:111](../backend/core/views.py#L111) and [:212](../backend/core/views.py#L212) and [:282](../backend/core/views.py#L282), change `https://frontend.com` to `http://localhost:3000`. Or better, move to an env var:
   ```python
   FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
   verify_url = f"{FRONTEND_URL}/verify-email?uid={uid}&token={token}"
   ```

3. **(Optional) Add `/api/users/count/`** for `user.countAll`:
   ```python
   # views.py
   @api_view(['GET'])
   @permission_classes([AllowAny])
   def user_count(request):
       return Response({"count": User.objects.count()})
   ```
   ```python
   # urls.py
   path('users/count/', views.user_count, name='user_count'),
   ```
   Or just stub `{ count: 1 }` in the frontend mock.

4. **(Optional) Expose `ACCESS_TOKEN_LIFETIME` to frontend** so it can proactively refresh ~5 min before expiry. Not required for reactive-refresh flow.

### Phase B — Frontend: auth client (half day)

All files live under `src/lib/`. Create these:

#### `src/lib/tokens.ts` — token storage
```ts
const ACCESS_KEY  = 'auth.access';
const REFRESH_KEY = 'auth.refresh';

export const tokens = {
	getAccess:  () => localStorage.getItem(ACCESS_KEY),
	getRefresh: () => localStorage.getItem(REFRESH_KEY),
	set: ({ access, refresh }: { access: string; refresh?: string }) => {
		localStorage.setItem(ACCESS_KEY, access);
		if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
	},
	clear: () => {
		localStorage.removeItem(ACCESS_KEY);
		localStorage.removeItem(REFRESH_KEY);
	},
};
```

#### `src/lib/api.ts` — fetch wrapper with auto-refresh
```ts
import { tokens } from './tokens';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

class ApiError extends Error {
	constructor(public status: number, public body: any) {
		super(body?.detail || body?.message || `HTTP ${status}`);
	}
}

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
			const data = await res.json();
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
	_retry = true,
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

	if (res.status === 401 && _retry && tokens.getRefresh()) {
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
	get:    <T>(p: string)             => request<T>('GET', p),
	post:   <T>(p: string, b?: unknown) => request<T>('POST', p, b),
	put:    <T>(p: string, b: unknown) => request<T>('PUT', p, b),
	patch:  <T>(p: string, b: unknown) => request<T>('PATCH', p, b),
	delete: <T>(p: string)             => request<T>('DELETE', p),
};

export { ApiError };
```

#### `src/lib/auth.ts` — login / signup / session helpers
```ts
import { api, ApiError } from './api';
import { tokens } from './tokens';

export interface User {
	id: number;
	email: string;
	firstName: string;
	lastName: string;
}

interface DjangoLoginResponse {
	success: boolean;
	refresh: string;
	access: string;
	user: { email: string; first_name: string; last_name: string };
}

interface DjangoWhoamiResponse {
	id: number;
	email: string;
	first_name: string;
	last_name: string;
}

const djangoUserToNao = (u: DjangoWhoamiResponse | DjangoLoginResponse['user'] & { id?: number }): User => ({
	id: (u as any).id ?? 0,
	email: u.email,
	firstName: u.first_name,
	lastName: u.last_name,
});

export async function login(email: string, password: string): Promise<User> {
	const data = await api.post<DjangoLoginResponse>('/token/', { email, password });
	tokens.set({ access: data.access, refresh: data.refresh });
	return djangoUserToNao(data.user);
}

export async function signup(input: {
	email: string; firstName: string; lastName: string;
	password1: string; password2: string;
}): Promise<{ message: string }> {
	return api.post('/signup/', {
		email: input.email,
		first_name: input.firstName,
		last_name: input.lastName,
		password1: input.password1,
		password2: input.password2,
	});
}

export async function logout(): Promise<void> {
	const refresh = tokens.getRefresh();
	try {
		if (refresh) await api.post('/logout/', { refresh });
	} catch { /* ignore — we're logging out anyway */ }
	tokens.clear();
}

export async function getSession(): Promise<User | null> {
	if (!tokens.getAccess()) return null;
	try {
		const me = await api.get<DjangoWhoamiResponse>('/whoami/');
		return djangoUserToNao(me);
	} catch (err) {
		if (err instanceof ApiError && err.status === 401) return null;
		throw err;
	}
}

export const forgotPassword = (email: string) =>
	api.post<{ message: string }>('/password/reset/', { email });

export const validateResetToken = (uid: string, token: string) =>
	api.post<{ valid: boolean; message?: string }>('/password/reset/validate/', { uid, token });

export const confirmPasswordReset = (input: {
	uid: string; token: string; password1: string; password2: string;
}) => api.post<{ message: string }>('/password/reset/confirm/', input);

export const changePassword = (oldPw: string, newPw: string) =>
	api.post<{ message: string }>('/password/change/', {
		old_password: oldPw, new_password1: newPw, new_password2: newPw,
	});

export const verifyEmail = (uid: string, token: string) =>
	api.post<{ message: string }>('/email/verify/', { uid, token });

export const resendVerification = (email: string) =>
	api.post<{ message: string }>('/email/verify/resend/', { email });
```

#### `src/hooks/use-session.ts` — React hook for session
```ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSession, type User } from '@/lib/auth';

export function useSession() {
	return useQuery({
		queryKey: ['session'],
		queryFn: getSession,
		staleTime: 60_000,
		retry: false,
	});
}

export function useInvalidateSession() {
	const qc = useQueryClient();
	return () => qc.invalidateQueries({ queryKey: ['session'] });
}
```

### Phase C — Frontend: replace Better Auth call sites (half day)

Find every better-auth usage:

```bash
cd D:/01_Work/django_sqlagent/frontend
grep -rln "better-auth" src
```

Likely files:
- `src/main.tsx` or `src/lib/auth.ts` — the Better Auth client setup
- `src/routes/login.tsx`, `src/routes/sign-up.tsx` (or similar)
- `src/routes/forgot-password.tsx`
- `src/routes/__root.tsx` or similar — session provider

For each:

| Before (Better Auth) | After (Django JWT) |
|---|---|
| `import { createAuthClient } from 'better-auth/react'` | `import { login, signup, logout, useSession } from '@/lib/auth'` |
| `authClient.signIn.email({ email, password })` | `login(email, password)` |
| `authClient.signUp.email({ email, password, name })` | `signup({ email, firstName, lastName, password1, password2 })` |
| `authClient.signOut()` | `logout()` |
| `useSession()` from better-auth | `useSession()` from `@/hooks/use-session` |

**Replace the route guard.** Somewhere (probably in `__root.tsx` or a `_sidebar-layout.tsx` loader), the app checks "is the user logged in?" Replace that logic:

```tsx
// AFTER
import { getSession } from '@/lib/auth';

export const Route = createFileRoute('/_sidebar-layout')({
	beforeLoad: async () => {
		const user = await getSession();
		if (!user) throw redirect({ to: '/login' });
		return { user };
	},
});
```

### Phase D — Frontend: new pages for Django email flows (2 hours)

Add two routes that Django expects but nao's frontend doesn't have:

#### `src/routes/verify-email.tsx`
```tsx
import { createFileRoute, useSearch, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { verifyEmail } from '@/lib/auth';

export const Route = createFileRoute('/verify-email')({
	validateSearch: (s: Record<string, unknown>) => ({
		uid: String(s.uid ?? ''),
		token: String(s.token ?? ''),
	}),
	component: VerifyEmailPage,
});

function VerifyEmailPage() {
	const { uid, token } = Route.useSearch();
	const [state, setState] = useState<'pending' | 'ok' | 'error'>('pending');
	const [message, setMessage] = useState('');

	useEffect(() => {
		verifyEmail(uid, token)
			.then(res => { setState('ok'); setMessage(res.message); })
			.catch(err => { setState('error'); setMessage(err.message); });
	}, [uid, token]);

	if (state === 'pending') return <div>Verifying…</div>;
	return (
		<div className="p-8">
			<h1>{state === 'ok' ? 'Email verified' : 'Verification failed'}</h1>
			<p>{message}</p>
			{state === 'ok' && <Link to="/login">Go to login</Link>}
		</div>
	);
}
```

#### `src/routes/reset-password.tsx`
Two-stage: validate the token (show loader) → if valid, show password form → on submit, confirm reset.

### Phase E — Misc

1. **Add `VITE_API_BASE`** to `.env.development`:
   ```
   VITE_API_BASE=http://localhost:8000/api
   ```
   (Or keep the Vite proxy and make it `/api`.)

2. **Update Vite proxy** in [vite.config.ts](vite.config.ts) to point at Django:
   ```ts
   proxy: {
     '/api': { target: 'http://127.0.0.1:8000' },   // was 5005 (nao backend)
   }
   ```
   Remove `/i/` and `/c/` proxies (Django doesn't use those paths).

3. **Remove better-auth from `package.json`** once nothing imports it:
   ```bash
   npm uninstall better-auth
   ```

---

## 5. Execution checklist

Concrete order to tackle these. Check off as you go:

### Django side
- [ ] `uv add django-cors-headers` + enable in settings
- [ ] Set `CORS_ALLOWED_ORIGINS = ["http://localhost:3000"]`
- [ ] Replace hardcoded `https://frontend.com` in `views.py` with `FRONTEND_URL` env var → `http://localhost:3000`
- [ ] (optional) Add `/api/users/count/` endpoint
- [ ] Start Django: `python manage.py runserver` (default :8000)

### Frontend side
- [ ] Create `src/lib/tokens.ts`
- [ ] Create `src/lib/api.ts`
- [ ] Create `src/lib/auth.ts`
- [ ] Create `src/hooks/use-session.ts`
- [ ] Update Vite proxy to `http://127.0.0.1:8000`
- [ ] Find better-auth call sites: `grep -rln "better-auth" src`
- [ ] Replace login form's `authClient.signIn.email` → `login()`
- [ ] Replace signup form's `authClient.signUp.email` → `signup()`
- [ ] Replace session provider → `useSession()` from the new hook
- [ ] Replace route guard → `getSession` check in `beforeLoad`
- [ ] Replace logout button → `logout()`
- [ ] Add `src/routes/verify-email.tsx`
- [ ] Adapt (or add) `src/routes/reset-password.tsx`
- [ ] Test end-to-end: signup → check Django console for email link → verify → login → reload → session persists → logout
- [ ] `npm uninstall better-auth` once no references remain

---

## 6. End-to-end test flow

After Phase C is done, this is the happy path you should be able to walk:

1. Start Django: `python manage.py runserver` (port 8000).
2. Start frontend: `npm run dev` (port 3000).
3. Visit `http://localhost:3000`. You get redirected to `/login`.
4. Click "Sign up", fill the form, submit. Frontend shows "check your email".
5. Open Django's terminal — `EMAIL_BACKEND = console` prints the full email including the verify link.
6. Click the link (it'll be `http://localhost:3000/verify-email?uid=…&token=…`).
7. `/verify-email` page calls Django, shows "Email verified".
8. Go to `/login`, enter credentials → you should land on the chat page (even if broken-looking — that's Phase 2).
9. Reload the page → session still there, no re-login needed.
10. Network tab shows `Authorization: Bearer …` on requests to `/api/whoami/` and later chat endpoints.
11. Click Logout → redirect to `/login`.

Verify Step 9 especially — that's the JWT refresh working. To really test the refresh path, set `ACCESS_TOKEN_LIFETIME` to `timedelta(seconds=30)` temporarily and watch the network tab: after 30 seconds a 401 should trigger a silent `/token/refresh/` call, then the original request retries.

---

## 7. Risks / things to watch

1. **CORS `credentials: include`** — we're NOT using cookies, so `credentials` shouldn't be `include` in fetch calls. The `api.ts` above deliberately omits it. If you copy-paste fetch calls from nao that have `credentials: 'include'`, strip that out.
2. **Better-auth session cookie** — nao's frontend might still try to read a cookie named `better-auth.session-token`. After replacing the calls, open DevTools → Application → Cookies and delete any stray cookies to be sure the old session machinery isn't interfering.
3. **`user.id` is `0`** — our login mapper fakes `id: 0` when coming from the login response (Django's login payload doesn't include id). `whoami` gives the real id. So on first login, briefly `user.id === 0` — not a problem unless something downstream keys on it. Call `useSession` instead of relying on the initial login response when you need the ID.
4. **Password validators** — Django's `AUTH_PASSWORD_VALIDATORS` reject common / short passwords. Signup errors will come through as `{ errors: { password1: ["..."] } }`. Your signup form should display field-level errors.
5. **Token blacklist on password change** — currently `password_change` keeps tokens alive. `password_reset_confirm` blacklists all tokens. If you want "change password = log out everywhere" behavior for `password_change` too, uncomment lines 451–454 in [views.py](../backend/core/views.py).
6. **Refresh token rotation** — `ROTATE_REFRESH_TOKENS=True` means every `/token/refresh/` call invalidates the old refresh and issues a new one. The `api.ts` above handles this by storing both `access` and `refresh` from the refresh response. If you forget to store the new refresh, the next refresh attempt will 401.
7. **Race condition on concurrent 401s** — if 5 requests all 401 simultaneously, they shouldn't all call `/token/refresh/` 5 times. The `api.ts` above uses a shared `refreshing` Promise to coalesce them. Don't remove that.

---

## 8. Files to create / modify

### New files in frontend
- `src/lib/tokens.ts`
- `src/lib/api.ts`
- `src/lib/auth.ts`
- `src/hooks/use-session.ts`
- `src/routes/verify-email.tsx`
- `src/routes/reset-password.tsx` (or adapt existing)

### Modified files in frontend
- `src/routes/login.tsx` (whatever the sign-in route is called)
- `src/routes/sign-up.tsx` or `/signup.tsx`
- `src/routes/forgot-password.tsx`
- `src/routes/__root.tsx` (or the layout that guards auth)
- `src/main.tsx` (remove better-auth provider)
- `vite.config.ts` (proxy → Django)
- `.env.development` (add `VITE_API_BASE`)
- `package.json` (remove `better-auth` dep after cleanup)

### Modified files in Django
- `agent/settings.py` — CORS
- `core/views.py` — replace hardcoded frontend URL with env var
- `core/urls.py` — add `/users/count/` (optional)

**Total new files: ~6. Modified files: ~8. Estimated effort: 1.5 days.**

---

## 9. What's NOT in this plan (on purpose)

- Chat, messages, projects, memory — all deferred to Phase 2+
- Social auth (Google / GitHub) — Django doesn't have it; add later if needed
- 2FA — not in scope
- Session persistence across browser restarts — `localStorage` handles it
- Email verification page styling — match existing nao design, not spec'd here
