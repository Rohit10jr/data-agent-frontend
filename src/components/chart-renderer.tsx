// Renders a Chart.js-shaped JSON config (produced by the backend's generate_chart
// tool) using Recharts. Recharts is SVG-native, so charts are real <svg> elements
// in the DOM — scalable, themeable, and downloadable as PNG.

import { useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Legend,
	Line,
	LineChart,
	Pie,
	PieChart,
	ResponsiveContainer,
	Scatter,
	ScatterChart,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';

type ChartType = 'bar' | 'line' | 'doughnut' | 'scatter';

interface ChartDataset {
	label?: string;
	data: unknown[];
	backgroundColor?: string | string[];
	borderColor?: string;
}

interface ChartConfig {
	type: ChartType;
	data: { labels?: unknown[]; datasets: ChartDataset[] };
	options?: {
		plugins?: { title?: { text?: string } };
	};
}

interface Props {
	config: ChartConfig;
}

const PALETTE = [
	'#ef4444',
	'#f97316',
	'#eab308',
	'#22c55e',
	'#06b6d4',
	'#3b82f6',
	'#8b5cf6',
	'#ec4899',
];

const isEmpty = (config: ChartConfig): boolean => {
	const ds = config.data?.datasets?.[0];
	const data = (ds?.data as unknown[] | undefined) ?? [];
	const labels = config.data?.labels ?? [];
	return data.length === 0 && labels.length === 0;
};

const getTitle = (config: ChartConfig): string =>
	config.options?.plugins?.title?.text || 'chart';

const datasetColor = (ds: ChartDataset, fallback: string): string => {
	const bg = ds.backgroundColor;
	if (typeof bg === 'string') return bg;
	if (Array.isArray(bg) && typeof bg[0] === 'string') return bg[0];
	return ds.borderColor || fallback;
};

// Build a rows array Recharts can consume: each row keyed by the x-axis label
// (`name`) plus one numeric key per dataset.
const buildCategoryRows = (
	config: ChartConfig,
): Array<Record<string, unknown>> => {
	const labels = config.data.labels ?? [];
	return labels.map((label, i) => {
		const row: Record<string, unknown> = { name: String(label) };
		for (const ds of config.data.datasets) {
			const key = ds.label || 'value';
			row[key] = (ds.data as unknown[])[i];
		}
		return row;
	});
};

const buildPieRows = (
	config: ChartConfig,
): Array<{ name: string; value: number }> => {
	const labels = config.data.labels ?? [];
	const values = (config.data.datasets[0]?.data as unknown[]) ?? [];
	return labels.map((label, i) => ({
		name: String(label),
		value: Number(values[i] ?? 0),
	}));
};

const buildScatterRows = (
	config: ChartConfig,
): Array<{ x: number; y: number }> => {
	const points = (config.data.datasets[0]?.data as unknown[]) ?? [];
	return points.map((p) => {
		const point = p as { x?: unknown; y?: unknown };
		return { x: Number(point.x ?? 0), y: Number(point.y ?? 0) };
	});
};

// Serialize the chart's <svg> to a PNG blob and trigger a download. Uses the
// device pixel ratio so the exported image is crisp on hi-DPI screens.
const downloadSvgAsPng = (svg: SVGSVGElement, filename: string) => {
	const rect = svg.getBoundingClientRect();
	const width = Math.max(1, Math.round(rect.width));
	const height = Math.max(1, Math.round(rect.height));
	const dpr = window.devicePixelRatio || 1;

	const clone = svg.cloneNode(true) as SVGSVGElement;
	clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
	clone.setAttribute('width', String(width));
	clone.setAttribute('height', String(height));

	const svgStr = new XMLSerializer().serializeToString(clone);
	const svgUrl = URL.createObjectURL(
		new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' }),
	);

	const img = new Image();
	img.onload = () => {
		const canvas = document.createElement('canvas');
		canvas.width = width * dpr;
		canvas.height = height * dpr;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

		canvas.toBlob((blob) => {
			if (!blob) return;
			const pngUrl = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = pngUrl;
			link.download = `${filename}.png`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(pngUrl);
			URL.revokeObjectURL(svgUrl);
		}, 'image/png');
	};
	img.src = svgUrl;
};

export function ChartRenderer({ config }: Props) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [isDownloading, setIsDownloading] = useState(false);
	const title = getTitle(config);

	const chart = useMemo(() => renderChart(config), [config]);

	const handleDownload = () => {
		const svg = containerRef.current?.querySelector('svg');
		if (!svg) return;
		setIsDownloading(true);
		try {
			downloadSvgAsPng(svg as SVGSVGElement, title);
		} finally {
			setTimeout(() => setIsDownloading(false), 500);
		}
	};

	if (isEmpty(config)) {
		return (
			<div className='my-2 text-sm text-muted-foreground border border-dashed border-border rounded-md p-4 text-center'>
				Chart has no data — the previous query returned no rows.
			</div>
		);
	}

	if (!chart) {
		return (
			<div className='my-2 text-sm text-muted-foreground'>
				Unsupported chart type: {String(config.type)}
			</div>
		);
	}

	return (
		<div className='group relative my-3 w-full max-w-2xl border border-border rounded-md bg-panel p-3'>
			<button
				type='button'
				onClick={handleDownload}
				disabled={isDownloading}
				title='Download as PNG'
				className='absolute top-2 right-2 z-10 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50'
			>
				<Download className='size-3.5' />
			</button>
			<div ref={containerRef} className='relative h-72'>
				<ResponsiveContainer width='100%' height='100%'>
					{chart}
				</ResponsiveContainer>
			</div>
		</div>
	);
}

function renderChart(config: ChartConfig): React.ReactElement | null {
	switch (config.type) {
		case 'bar': {
			const rows = buildCategoryRows(config);
			return (
				<BarChart data={rows} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
					<CartesianGrid strokeDasharray='3 3' className='stroke-border' />
					<XAxis dataKey='name' tick={{ fontSize: 12 }} />
					<YAxis tick={{ fontSize: 12 }} />
					<Tooltip />
					{config.data.datasets.map((ds, i) => (
						<Bar
							key={ds.label || `series-${i}`}
							dataKey={ds.label || 'value'}
							fill={datasetColor(ds, PALETTE[i % PALETTE.length])}
						/>
					))}
				</BarChart>
			);
		}

		case 'line': {
			const rows = buildCategoryRows(config);
			return (
				<LineChart data={rows} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
					<CartesianGrid strokeDasharray='3 3' className='stroke-border' />
					<XAxis dataKey='name' tick={{ fontSize: 12 }} />
					<YAxis tick={{ fontSize: 12 }} />
					<Tooltip />
					{config.data.datasets.map((ds, i) => (
						<Line
							key={ds.label || `series-${i}`}
							type='monotone'
							dataKey={ds.label || 'value'}
							stroke={datasetColor(ds, PALETTE[i % PALETTE.length])}
							strokeWidth={2}
							dot={false}
						/>
					))}
				</LineChart>
			);
		}

		case 'doughnut': {
			const rows = buildPieRows(config);
			return (
				<PieChart>
					<Tooltip />
					<Legend />
					<Pie
						data={rows}
						dataKey='value'
						nameKey='name'
						cx='50%'
						cy='50%'
						innerRadius='55%'
						outerRadius='80%'
						paddingAngle={2}
					>
						{rows.map((_, i) => (
							<Cell key={i} fill={PALETTE[i % PALETTE.length]} />
						))}
					</Pie>
				</PieChart>
			);
		}

		case 'scatter': {
			const rows = buildScatterRows(config);
			return (
				<ScatterChart margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
					<CartesianGrid strokeDasharray='3 3' className='stroke-border' />
					<XAxis dataKey='x' type='number' tick={{ fontSize: 12 }} />
					<YAxis dataKey='y' type='number' tick={{ fontSize: 12 }} />
					<Tooltip cursor={{ strokeDasharray: '3 3' }} />
					<Scatter data={rows} fill={PALETTE[0]} />
				</ScatterChart>
			);
		}

		default:
			return null;
	}
}
