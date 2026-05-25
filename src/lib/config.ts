/**
 * API base URL resolver. Single source of truth used by `api.ts` (REST) and
 * `django-stream.ts` (SSE).
 *
 *   Dev   — VITE_API_BASE_URL is empty → API_BASE = "/api" → Vite dev server
 *           proxies to the local Django at http://127.0.0.1:8000 (see
 *           vite.config.ts).
 *   Prod  — VITE_API_BASE_URL is set → API_BASE = "<host>/api" → direct
 *           cross-origin call to the hosted backend. Backend must include
 *           the frontend's origin in CORS_ALLOWED_ORIGINS.
 */
const RAW = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';
export const API_BASE = `${RAW}/api`;
