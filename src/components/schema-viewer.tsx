// Schema-agent project page. 40/60 split: refine-chat on the left, schema
// visualizations (cards + ER diagram + generated SQL/seed) on the right.
// Updates live as the streaming agent emits SCHEMA and SQL result events.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
	Background,
	Controls,
	Handle,
	MarkerType,
	Position,
	ReactFlow,
	type Edge,
	type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
	Bot,
	Database,
	FileText,
	KeyRound,
	Link2,
	Loader2,
	Send,
	Table2,
	User,
} from 'lucide-react';

import {
	type SqlDialect,
	type SqlVariantResponse,
	useSchemaProjectQuery,
	useSchemaVariantMutation,
} from '@/queries/use-schema-list-query';
import {
	type SchemaStreamState,
	mergeHistoryWithLive,
	pickLatestArtifacts,
	useSchemaStream,
} from '@/queries/use-schema-stream';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Column {
	name: string;
	type: string;
	constraints: string;
}
interface ParsedTable {
	name: string;
	columns: Column[];
}

interface Props {
	slug?: string;
}

const DIALECT_OPTIONS: { value: 'plain' | SqlDialect; label: string }[] = [
	{ value: 'plain', label: 'Plain' },
	{ value: 'postgres', label: 'Postgres' },
	{ value: 'mysql', label: 'MySQL' },
	{ value: 'tsql', label: 'T-SQL' },
	{ value: 'snowflake', label: 'Snowflake' },
	{ value: 'sqlite', label: 'SQLite' },
];

function parseTables(schemaTable: string | null): ParsedTable[] {
	if (!schemaTable) return [];
	try {
		const obj = JSON.parse(schemaTable);
		return Array.isArray(obj?.tables) ? obj.tables : [];
	} catch {
		return [];
	}
}

export function SchemaViewer({ slug }: Props) {
	const project = useSchemaProjectQuery(slug);
	const stream = useSchemaStream({ slug });

	const turns = mergeHistoryWithLive(project.data?.messages, stream);
	const { schemaTable, sqlTable, sqlSeedData } = pickLatestArtifacts(project.data, stream);
	const tables = useMemo(() => parseTables(schemaTable), [schemaTable]);

	const projectName = project.data?.name ?? (slug ? 'Loading…' : 'New schema project');
	const projectId = project.data?.id;

	return (
		<div className='flex flex-col h-full bg-panel'>
			<header className='px-6 py-4 border-b border-border'>
				<h1 className='text-lg font-semibold truncate'>{projectName}</h1>
			</header>

			<div className='flex-1 grid grid-cols-1 md:grid-cols-5 overflow-hidden'>
				<RefinePanel
					turns={turns}
					stream={stream}
					hasSlug={!!slug}
				/>
				<SchemaPanel
					tables={tables}
					sqlPlain={sqlTable}
					seedPlain={sqlSeedData}
					projectId={projectId}
				/>
			</div>
		</div>
	);
}

// ── Left: refine chat (40%) ─────────────────────────────────────────────

function RefinePanel({
	turns,
	stream,
	hasSlug,
}: {
	turns: ReturnType<typeof mergeHistoryWithLive>;
	stream: SchemaStreamState & { sendMessage: (text: string) => void; abort: () => void };
	hasSlug: boolean;
}) {
	const [value, setValue] = useState('');
	const bottomRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [turns, stream.currentNode]);

	const submit = () => {
		const trimmed = value.trim();
		if (!trimmed || stream.isStreaming) return;
		stream.sendMessage(trimmed);
		setValue('');
	};

	return (
		<div className='md:col-span-2 flex flex-col border-r border-border min-h-0'>
			<div className='flex-1 overflow-y-auto px-4 py-4 space-y-3'>
				{turns.length === 0 && !stream.isStreaming && (
					<div className='text-sm text-muted-foreground space-y-2 mt-6'>
						<p className='font-medium text-foreground'>Refine the schema by chat.</p>
						<ul className='list-disc pl-5 space-y-1 text-xs'>
							<li>Add or remove tables</li>
							<li>Change column types or constraints</li>
							<li>Introduce relationships between tables</li>
						</ul>
					</div>
				)}

				{turns.map((t) => (
					<div key={t.id} className='flex gap-2.5'>
						<div className='shrink-0 size-6 rounded-full bg-sidebar-accent flex items-center justify-center mt-0.5'>
							{t.role === 'user' ? <User className='size-3.5' /> : <Bot className='size-3.5' />}
						</div>
						<div
							className={cn(
								'flex-1 rounded-lg px-3 py-2 text-sm whitespace-pre-wrap',
								t.role === 'user'
									? 'bg-foreground/5 text-foreground'
									: 'bg-sidebar-accent text-foreground',
							)}
						>
							{t.text || (t.role === 'assistant' ? '…' : '')}
						</div>
					</div>
				))}

				{stream.isStreaming && stream.currentNode && (
					<div className='inline-flex items-center gap-2 rounded-md bg-sidebar-accent px-2.5 py-1 text-xs text-muted-foreground'>
						<Loader2 className='size-3 animate-spin' />
						{stream.currentNode}
					</div>
				)}

				{stream.streamError && (
					<p className='text-xs text-red-500'>{stream.streamError}</p>
				)}

				<div ref={bottomRef} />
			</div>

			<div className='border-t border-border p-3'>
				<div
					className={cn(
						'rounded-2xl border border-border bg-background',
						'focus-within:border-foreground transition-colors',
					)}
				>
					<textarea
						value={value}
						onChange={(e) => setValue(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && !e.shiftKey) {
								e.preventDefault();
								submit();
							}
						}}
						placeholder={
							hasSlug ? 'Describe changes…' : 'Describe the schema you want to design…'
						}
						disabled={stream.isStreaming}
						rows={2}
						className='block w-full resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground'
					/>
					<div className='flex items-center justify-end px-2 pb-2'>
						<Button
							size='icon-sm'
							onClick={submit}
							disabled={stream.isStreaming || !value.trim()}
							title='Send'
						>
							{stream.isStreaming ? (
								<Loader2 className='size-3.5 animate-spin' />
							) : (
								<Send className='size-3.5' />
							)}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

// ── Right: schema visualizations (60%) ──────────────────────────────────

function SchemaPanel({
	tables,
	sqlPlain,
	seedPlain,
	projectId,
}: {
	tables: ParsedTable[];
	sqlPlain: string | null;
	seedPlain: string | null;
	projectId: number | undefined;
}) {
	return (
		<div className='md:col-span-3 overflow-y-auto'>
			<div className='p-6 space-y-6'>
				<SchemaCardSection tables={tables} />
				<GeneratedAssetsSection
					sqlPlain={sqlPlain}
					seedPlain={seedPlain}
					projectId={projectId}
				/>
				<ERDiagramSection tables={tables} />
			</div>
		</div>
	);
}

// ── Card grid ───────────────────────────────────────────────────────────

function SchemaCardSection({ tables }: { tables: ParsedTable[] }) {
	return (
		<section>
			<SectionHeader icon={Table2} title='Tables' count={tables.length} />
			{tables.length === 0 ? (
				<EmptyHint text='Tables will appear here as the agent designs the schema.' />
			) : (
				<div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
					{tables.map((t) => (
						<TableCard key={t.name} table={t} />
					))}
				</div>
			)}
		</section>
	);
}

function TableCard({ table }: { table: ParsedTable }) {
	return (
		<div className='border border-border rounded-lg overflow-hidden bg-background hover:border-foreground/30 transition-colors'>
			<div className='flex items-center justify-between px-3 py-2 bg-sidebar-accent border-b border-border'>
				<span className='font-mono text-sm font-semibold'>{table.name}</span>
				<Database className='size-3.5 text-muted-foreground' />
			</div>
			<div className='divide-y divide-border'>
				{table.columns.map((col) => {
					const isPK = col.constraints.toUpperCase().includes('PRIMARY KEY');
					const isFK =
						col.constraints.toUpperCase().includes('REFERENCES') ||
						col.name.toLowerCase().endsWith('_id');
					return (
						<div
							key={col.name}
							className='flex items-center justify-between px-3 py-1.5 text-xs'
						>
							<div className='flex items-center gap-2 min-w-0'>
								{isPK && (
									<KeyRound className='size-3 text-amber-500 shrink-0' />
								)}
								{!isPK && isFK && (
									<Link2 className='size-3 text-blue-500 shrink-0' />
								)}
								<span className='font-mono truncate'>{col.name}</span>
							</div>
							<span className='font-mono text-muted-foreground text-[10px] shrink-0 ml-2'>
								{col.type}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

// ── Generated assets (SQL + seed + dialect picker) ──────────────────────

function GeneratedAssetsSection({
	sqlPlain,
	seedPlain,
	projectId,
}: {
	sqlPlain: string | null;
	seedPlain: string | null;
	projectId: number | undefined;
}) {
	const [dialect, setDialect] = useState<'plain' | SqlDialect>('plain');
	const [variants, setVariants] = useState<Partial<Record<SqlDialect, SqlVariantResponse>>>({});
	const variantMutation = useSchemaVariantMutation();

	useEffect(() => {
		if (dialect === 'plain' || !projectId) return;
		if (variants[dialect]) return; // cached
		if (variantMutation.isPending) return;
		variantMutation
			.mutateAsync({ projectId, dialect })
			.then((data) =>
				setVariants((prev) => ({
					...prev,
					[dialect]: data,
				})),
			)
			.catch(() => {
				// Mutation state surfaces the error in the UI below.
			});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [dialect, projectId]);

	const displaySql = dialect === 'plain' ? sqlPlain : variants[dialect]?.sql_table ?? null;
	const displaySeed =
		dialect === 'plain' ? seedPlain : variants[dialect]?.sql_seed_data ?? null;
	const hasAnything = !!(displaySql || displaySeed);

	return (
		<section>
			<div className='flex items-center justify-between mb-3'>
				<SectionHeader icon={FileText} title='Generated assets' />
				<DialectPicker
					value={dialect}
					onChange={setDialect}
					loading={variantMutation.isPending}
					disabled={!projectId}
				/>
			</div>

			{!hasAnything ? (
				<EmptyHint text='SQL and seed data will appear here once the agent generates them.' />
			) : (
				<div className='space-y-3'>
					{displaySql && (
						<CodeBlock title='CREATE TABLE' language='sql' body={displaySql} />
					)}
					{displaySeed && (
						<CodeBlock title='Seed data' language='sql' body={displaySeed} />
					)}
				</div>
			)}

			{variantMutation.isError && (
				<p className='mt-2 text-xs text-red-500'>
					Failed to load {dialect} variant. Try again.
				</p>
			)}
		</section>
	);
}

function DialectPicker({
	value,
	onChange,
	loading,
	disabled,
}: {
	value: 'plain' | SqlDialect;
	onChange: (next: 'plain' | SqlDialect) => void;
	loading: boolean;
	disabled: boolean;
}) {
	return (
		<div className='flex items-center gap-2 text-xs'>
			{loading && <Loader2 className='size-3 animate-spin text-muted-foreground' />}
			<label className='text-muted-foreground uppercase tracking-wider text-[10px]'>
				Dialect
			</label>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value as 'plain' | SqlDialect)}
				disabled={disabled || loading}
				className='bg-background border border-border rounded-md px-2 py-1 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed'
			>
				{DIALECT_OPTIONS.map((d) => (
					<option key={d.value} value={d.value}>
						{d.label}
					</option>
				))}
			</select>
		</div>
	);
}

function CodeBlock({
	title,
	language,
	body,
}: {
	title: string;
	language: string;
	body: string;
}) {
	return (
		<div className='border border-border rounded-md overflow-hidden'>
			<div className='flex items-center justify-between px-3 py-1.5 bg-sidebar-accent border-b border-border text-xs'>
				<span className='font-medium'>{title}</span>
				<span className='text-muted-foreground font-mono uppercase'>{language}</span>
			</div>
			<pre className='p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap'>
				{body}
			</pre>
		</div>
	);
}

// ── ER diagram ──────────────────────────────────────────────────────────

function ERDiagramSection({ tables }: { tables: ParsedTable[] }) {
	const { nodes, edges } = useMemo(() => buildErGraph(tables), [tables]);

	return (
		<section>
			<SectionHeader icon={Link2} title='ER diagram' />
			{tables.length === 0 ? (
				<EmptyHint text='Relationships will be inferred from foreign keys once tables exist.' />
			) : (
				<div className='h-[500px] border border-border rounded-md overflow-hidden bg-background'>
					<ReactFlow
						nodes={nodes}
						edges={edges}
						nodeTypes={erNodeTypes}
						fitView
						proOptions={{ hideAttribution: true }}
					>
						<Background gap={16} />
						<Controls showInteractive={false} />
					</ReactFlow>
				</div>
			)}
		</section>
	);
}

// ER nodes: one custom table node per table. Edges inferred from FK naming
// or explicit REFERENCES clauses.

const erNodeTypes = { table: ErTableNode };

interface ErNodeData {
	label: string;
	columns: Column[];
	[key: string]: unknown;
}

function ErTableNode({ data }: { data: ErNodeData }) {
	return (
		<div className='bg-background border border-border rounded-md shadow-sm overflow-hidden w-56 text-foreground'>
			<div className='px-2 py-1.5 bg-sidebar-accent border-b border-border text-[11px] font-semibold font-mono text-center'>
				{data.label}
			</div>
			<div className='py-1'>
				{data.columns.map((col) => {
					const isPK = col.constraints.toUpperCase().includes('PRIMARY KEY');
					const isFK =
						col.constraints.toUpperCase().includes('REFERENCES') ||
						col.name.toLowerCase().endsWith('_id');
					return (
						<div
							key={col.name}
							className='relative flex items-center justify-between px-2 py-0.5 text-[10px]'
						>
							<div className='flex items-center gap-1 min-w-0'>
								{isPK && <KeyRound className='size-2.5 text-amber-500 shrink-0' />}
								{!isPK && isFK && <Link2 className='size-2.5 text-blue-500 shrink-0' />}
								<span className='font-mono truncate'>{col.name}</span>
							</div>
							<span className='font-mono text-muted-foreground text-[9px] ml-1 shrink-0'>
								{col.type}
							</span>

							{isFK && (
								<Handle
									type='target'
									position={Position.Left}
									id={`${data.label}-${col.name}-target`}
									style={{ background: 'currentColor', left: -4, opacity: 0.6 }}
								/>
							)}
							{isPK && (
								<Handle
									type='source'
									position={Position.Right}
									id={`${data.label}-${col.name}-source`}
									style={{ background: 'currentColor', right: -4, opacity: 0.6 }}
								/>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

function buildErGraph(tables: ParsedTable[]): { nodes: Node[]; edges: Edge[] } {
	const nodes: Node[] = tables.map((t, i) => ({
		id: t.name,
		type: 'table',
		position: { x: (i % 3) * 280, y: Math.floor(i / 3) * 280 },
		data: { label: t.name, columns: t.columns } satisfies ErNodeData,
	}));

	const edges: Edge[] = [];
	for (const table of tables) {
		for (const col of table.columns) {
			let targetTable: string | undefined;

			// 1. Explicit REFERENCES <table>(<col>)
			const refMatch = col.constraints.match(/REFERENCES\s+(\w+)\s*\(/i);
			if (refMatch) {
				targetTable = refMatch[1];
			} else if (col.name.toLowerCase().endsWith('_id')) {
				// 2. Heuristic: `<thing>_id` → table `thing` or `things`
				const base = col.name.slice(0, -3).toLowerCase();
				targetTable = tables.find(
					(t) => t.name.toLowerCase() === base || t.name.toLowerCase() === `${base}s`,
				)?.name;
			}
			if (!targetTable || targetTable === table.name) continue;

			// Resolve PK column on target for sourceHandle (fallback to first column).
			const pkCol =
				tables
					.find((t) => t.name === targetTable)
					?.columns.find((c) => c.constraints.toUpperCase().includes('PRIMARY KEY'))
					?.name ?? 'id';

			edges.push({
				id: `${table.name}-${col.name}->${targetTable}`,
				source: targetTable,
				target: table.name,
				sourceHandle: `${targetTable}-${pkCol}-source`,
				targetHandle: `${table.name}-${col.name}-target`,
				animated: true,
				markerEnd: { type: MarkerType.ArrowClosed },
				style: { strokeWidth: 1.5 },
			});
		}
	}

	return { nodes, edges };
}

// ── Shared bits ─────────────────────────────────────────────────────────

function SectionHeader({
	icon: Icon,
	title,
	count,
}: {
	icon: typeof Database;
	title: string;
	count?: number;
}) {
	return (
		<h2 className='flex items-center gap-2 text-sm font-semibold mb-3'>
			<Icon className='size-4 text-muted-foreground' />
			{title}
			{typeof count === 'number' && (
				<span className='text-xs text-muted-foreground font-normal'>({count})</span>
			)}
		</h2>
	);
}

function EmptyHint({ text }: { text: string }) {
	return (
		<div className='border border-dashed border-border rounded-md p-6 text-center text-xs text-muted-foreground'>
			{text}
		</div>
	);
}
