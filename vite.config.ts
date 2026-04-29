import { fileURLToPath } from 'node:url';
import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import viteReact from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { defineConfig } from 'vite';

// Project roots, as POSIX paths (forward slashes) — Vite's alias matcher is
// happier with these on Windows.
const toPosix = (p: string) => p.replace(/\\/g, '/');
const ROOT = toPosix(fileURLToPath(new URL('.', import.meta.url)));
const SRC = `${ROOT}src`;
const SHARED = `${ROOT}shared/src`;

const NAO_BACKEND_ROOT = 'D:/02_Personal/01_OpenSource/03_Applications/agent_sql/nao';
const NAO_BACKEND_SRC = `${NAO_BACKEND_ROOT}/apps/backend/src`;

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		devtools({
			enhancedLogs: {
				enabled: false,
			},
		}),
		tanstackRouter({
			target: 'react',
			autoCodeSplitting: false,
		}),
		viteReact(),
		svgr({
			include: '**/*.svg',
			svgrOptions: { exportType: 'default' },
		}),
		tailwindcss(),
	],
	resolve: {
		// Use array form so order is explicit and regex can match subpaths.
		alias: [
			// ── @nao/backend ── type-only imports from the nao repo
			// (specific subpaths must come BEFORE any broader match)
			{ find: '@nao/backend/trpc', replacement: `${NAO_BACKEND_SRC}/trpc/router.ts` },
			{ find: '@nao/backend/chat', replacement: `${NAO_BACKEND_SRC}/types/chat.ts` },
			{ find: '@nao/backend/usage', replacement: `${NAO_BACKEND_SRC}/types/usage.ts` },
			{ find: '@nao/backend/llm', replacement: `${NAO_BACKEND_SRC}/types/llm.ts` },
			{ find: '@nao/backend/memory', replacement: `${NAO_BACKEND_SRC}/types/memory.ts` },
			{ find: '@nao/backend/saved-prompts', replacement: `${NAO_BACKEND_SRC}/types/saved-prompt.ts` },
			{ find: '@nao/backend/log', replacement: `${NAO_BACKEND_SRC}/types/log.ts` },
			{ find: '@nao/backend/tools', replacement: `${NAO_BACKEND_SRC}/agents/tools/index.ts` },
			{ find: '@nao/backend/providers', replacement: `${NAO_BACKEND_SRC}/agents/providers.ts` },
			{ find: '@nao/backend/provider-meta', replacement: `${NAO_BACKEND_SRC}/agents/provider-meta.ts` },
			{ find: '@nao/backend/shared-chat', replacement: `${NAO_BACKEND_SRC}/queries/shared-chat.queries.ts` },

			// ── @nao/shared ── lives inside this repo at ./shared/src
			// Specific index import first, then regex catch-all for subpaths
			// (Vite auto-resolves extensions, so `@nao/shared/types` → types.ts)
			{ find: /^@nao\/shared$/, replacement: `${SHARED}/index.ts` },
			{ find: /^@nao\/shared\/(.+)$/, replacement: `${SHARED}/$1` },

			// ── App internal alias ──
			{ find: '@', replacement: SRC.replace(/\/$/, '') },
		],
	},
	server: {
		// Vite blocks reads outside the project root by default. Whitelist the
		// external nao repo so @nao/backend aliases can load.
		fs: {
			allow: [
				fileURLToPath(new URL('.', import.meta.url)),
				NAO_BACKEND_ROOT,
			],
		},
		proxy: {
			// Django dev server runs on :8000
			'/api': { target: 'http://127.0.0.1:8000' },
		},
	},
});
