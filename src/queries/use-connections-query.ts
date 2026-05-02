import { useQuery } from '@tanstack/react-query';
import { connectionsApi } from '@/lib/connections';

export const CONNECTIONS_QUERY_KEY = ['connections'] as const;

export const useConnectionsQuery = () => {
	return useQuery({
		queryKey: CONNECTIONS_QUERY_KEY,
		queryFn: () => connectionsApi.list(),
	});
};
