// Renders a Chart.js JSON config produced by the backend's generate_chart tool.
// The backend ships a fully-filled config (type + data + options); this picks
// the matching react-chartjs-2 component.

import { useMemo } from 'react';
import { Bar, Line, Doughnut, Scatter } from 'react-chartjs-2';
import {
	Chart as ChartJS,
	ArcElement,
	BarElement,
	CategoryScale,
	Legend,
	LinearScale,
	LineElement,
	PointElement,
	Title,
	Tooltip,
} from 'chart.js';

ChartJS.register(
	ArcElement,
	BarElement,
	CategoryScale,
	Legend,
	LinearScale,
	LineElement,
	PointElement,
	Title,
	Tooltip,
);

type ChartType = 'bar' | 'line' | 'doughnut' | 'scatter';

interface ChartConfig {
	type: ChartType;
	data: { labels?: unknown[]; datasets: Array<Record<string, unknown>> };
	options?: Record<string, unknown>;
}

interface Props {
	config: ChartConfig;
}

const isEmpty = (config: ChartConfig): boolean => {
	const ds = config.data?.datasets?.[0];
	const data = (ds?.data as unknown[] | undefined) ?? [];
	const labels = config.data?.labels ?? [];
	return data.length === 0 && labels.length === 0;
};

export function ChartRenderer({ config }: Props) {
	const baseOptions = useMemo(
		() => ({
			responsive: true,
			maintainAspectRatio: false,
			...(config.options || {}),
		}),
		[config.options],
	);

	if (isEmpty(config)) {
		return (
			<div className='my-2 text-sm text-muted-foreground border border-dashed border-border rounded-md p-4 text-center'>
				Chart has no data — the previous query returned no rows.
			</div>
		);
	}

	const props = { data: config.data as never, options: baseOptions as never };

	let chart: React.ReactNode;
	switch (config.type) {
		case 'bar':
			chart = <Bar {...props} />;
			break;
		case 'line':
			chart = <Line {...props} />;
			break;
		case 'doughnut':
			chart = <Doughnut {...props} />;
			break;
		case 'scatter':
			chart = <Scatter {...props} />;
			break;
		default:
			return (
				<div className='my-2 text-sm text-muted-foreground'>
					Unsupported chart type: {String(config.type)}
				</div>
			);
	}

	return (
		<div className='my-3 w-full max-w-2xl border border-border rounded-md bg-panel p-3'>
			<div className='relative h-72'>{chart}</div>
		</div>
	);
}
