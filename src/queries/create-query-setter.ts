import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { Updater } from '@tanstack/react-query';

/**
 * Minimal procedure shape we care about — just needs queryKey.
 * Kept loose so the stubbed `trpc` proxy satisfies it without fancy inference.
 */
type TrpcQueryProcedure = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	queryKey: (...args: any[]) => readonly unknown[];
};

/**
 * Creates a hook that returns a memoized setter for a tRPC query's cache data.
 * Signature: `setter(input?, updater)` — for procedures without input, omit the first arg.
 *
 * @param getProcedure Function that returns the tRPC procedure. Using a function
 *                     avoids circular-dependency issues at module load time.
 */
export function createQuerySetter<TProcedure extends TrpcQueryProcedure>(getProcedure: () => TProcedure) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	type SetterFn = (...args: any[]) => void;

	return (): SetterFn => {
		const queryClient = useQueryClient();

		return useCallback(
			(...args: unknown[]) => {
				const procedure = getProcedure();
				if (args.length === 2) {
					const [input, updater] = args;
					queryClient.setQueryData(procedure.queryKey(input), updater as Updater<unknown, unknown>);
				} else {
					const [updater] = args;
					queryClient.setQueryData(procedure.queryKey(), updater as Updater<unknown, unknown>);
				}
			},
			[queryClient],
		) as SetterFn;
	};
}
