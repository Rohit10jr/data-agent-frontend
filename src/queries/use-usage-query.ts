import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type UsageGranularity = 'hour' | 'day' | 'month' | 'year';

export interface UsageBucket {
	bucket: string | null;          // ISO timestamp (truncated to the granularity)
	input_tokens: number;
	output_tokens: number;
	reasoning_tokens: number;
	total_tokens: number;
}

export interface UsageResponse {
	granularity: UsageGranularity;
	buckets: UsageBucket[];
	total_used: number;             // all-time total tokens for this user
	quota: number;                  // hardcoded on backend (1M for now)
	percent_used: number;           // total_used / quota * 100, 2 decimals
}

export const useUsageQuery = (granularity: UsageGranularity) => {
	return useQuery<UsageResponse>({
		queryKey: ['usage', granularity],
		queryFn: () => api.get<UsageResponse>(`/usage/?granularity=${granularity}`),
	});
};
