import './styles.css';
import { StrictMode } from 'react';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import { PostHogProvider } from './contexts/posthog.provider';
import { ThemeProvider } from './contexts/theme.provider';
import { routeTree } from './routeTree.gen';
import reportWebVitals from './reportWebVitals';

// Register the router instance for type safety
declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
	interface HistoryState {
		fromMessageSend?: boolean;
		openStorySlug?: string;
	}
}

// Create a new router instance
const router = createRouter({
	routeTree,
	context: {},
	defaultPreload: 'intent',
	scrollRestoration: true,
	defaultStructuralSharing: true,
	defaultPreloadStaleTime: 0,
});

/** Query client for state management */
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: false,
			staleTime: 5 * 60 * 1000, // 5 minutes
		},
	},
});

// ─── tRPC stub ────────────────────────────────────────────────────────
// nao's frontend was wired to a tRPC backend; we're swapping it for a Django
// REST backend. To avoid 404s during the migration, every `trpc.X.Y` access
// returns safe defaults: queries resolve to `null` instantly, mutations throw.
// Replace specific procedures with real Django calls one at a time.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

function makeStub(path: string[]): unknown {
	const target: Record<string, AnyFn> = {
		queryOptions: (..._args: unknown[]) => ({
			queryKey: ['__stub__', ...path, ..._args],
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			queryFn: async (): Promise<any> => null,
		}),
		mutationOptions: (opts: Record<string, unknown> = {}) => ({
			mutationFn: async () => {
				throw new Error(`[trpc-stub] ${path.join('.')} not implemented on Django backend`);
			},
			...opts,
		}),
		queryKey: (..._args: unknown[]) => ['__stub__', ...path, ..._args],
		infiniteQueryOptions: (..._args: unknown[]) => ({
			queryKey: ['__stub__', ...path, ..._args],
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			queryFn: async (): Promise<any> => ({ items: [], nextCursor: null }),
			initialPageParam: null,
			getNextPageParam: () => null,
		}),
	};

	return new Proxy(target, {
		get(t, prop) {
			if (typeof prop !== 'string') {
				return (t as Record<string, unknown>)[prop as unknown as string];
			}
			if (prop in t) return t[prop];
			return makeStub([...path, prop]);
		},
	});
}

// Recursive proxy type: every namespace access yields the same shape, so
// `trpc.namespace.procedure.queryOptions()` stays callable at any depth.
// We use `any` for TData so consumers don't have to cast `data?.x` at every site —
// this is a stub; real type safety returns when each procedure gets a Django call.
/* eslint-disable @typescript-eslint/no-explicit-any */
interface TrpcStubProcedure {
	queryOptions: (input?: unknown, opts?: unknown) => UseQueryOptions<any, Error, any>;
	// Opts is typed as `Partial<UseMutationOptions>` so caller callbacks like
	// `onError: (err) => ...` get their parameter inferred as `Error`.
	mutationOptions: (opts?: Partial<UseMutationOptions<any, Error, any>>) => UseMutationOptions<any, Error, any>;
	queryKey: (input?: unknown) => readonly unknown[];
	infiniteQueryOptions: (input?: unknown, opts?: unknown) => UseQueryOptions<any, Error, any>;
}
type TrpcStubProxy = TrpcStubProcedure & { [key: string]: TrpcStubProxy };
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Stub tRPC proxy. No HTTP requests fire. Replace per-procedure as Django endpoints come online. */
export const trpc = makeStub([]) as unknown as TrpcStubProxy;

/** Stub trpcClient — kept for any direct imports; throws on any call. */
export const trpcClient = new Proxy(
	{},
	{
		get() {
			throw new Error('[trpc-stub] trpcClient is disabled — use Django REST endpoints instead');
		},
	},
) as never;

// Render the app
const rootElement = document.getElementById('app')!;
if (!rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(
		<StrictMode>
			<ThemeProvider>
				<QueryClientProvider client={queryClient}>
					<PostHogProvider>
						<RouterProvider router={router} />
					</PostHogProvider>
				</QueryClientProvider>
			</ThemeProvider>
		</StrictMode>,
	);
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
