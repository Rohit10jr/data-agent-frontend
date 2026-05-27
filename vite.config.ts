import { fileURLToPath } from 'node:url';

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
		proxy: {
			// Django dev server runs on :8000
			'/api': { target: 'http://127.0.0.1:8000' },
		},
	},
});
