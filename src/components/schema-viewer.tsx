// Schema-agent project page. A permanent resizable split:
//   LEFT  (~45%) — refine chat, reuses the shared chat primitives + ChatComposer
//   RIGHT (~55%) — tabbed schema panel: Tables / ER Diagram / SQL & Seed
// The split ratio is drag-resizable and persisted via PanelGroup's autoSaveId.
// Updates live as the streaming agent emits SCHEMA / SQL result events.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
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
import { Database, KeyRound, Link2, Loader2 } from 'lucide-react';

import {
	type SqlDialect,
	type SqlVariantResponse,
	useSchemaProjectQuery,
	useSchemaVariantMutation,
} from '@/queries/use-schema-list-query';
import {
	mergeHistoryWithLive,
	pickLatestArtifacts,
	useSchemaStream,
} from '@/queries/use-schema-stream';
import { ChatComposer } from '@/components/chat-composer';
import { MessageRow, TextBubble, ThinkingIndicator } from '@/components/chat/chat-primitives';
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

type PanelTab = 'tables' | 'er' | 'sql';

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

	return (
		<div className='flex flex-col flex-1 overflow-hidden bg-panel min-w-0'>
			<PanelGroup direction='horizontal' autoSaveId='schema-split' className='flex-1 min-h-0'>
				<Panel defaultSize={45} minSize={30} className='min-w-0'>
					<SchemaChatPane turns={turns} stream={stream} hasSlug={!!slug} />
				</Panel>

				{/*
				Near-invisible resize handle (nao-stories style): generous 12px hit
				zone with no visible bar; a thin 1px rail fades in only on hover/drag.
				*/}
				<PanelResizeHandle
					className={cn(
						'group w-3 cursor-col-resize flex items-center justify-center',
						'transition-colors',
					)}
				>
					<div
						className={cn(
							'h-12 w-0.5 rounded-full bg-border opacity-60 transition-[opacity,background-color]',
							'group-hover:opacity-100 group-hover:bg-foreground/30',
							'group-data-[resize-handle-state=drag]:opacity-100 group-data-[resize-handle-state=drag]:bg-foreground/50',
						)}
					/>
				</PanelResizeHandle>

				<Panel defaultSize={55} minSize={30} className='min-w-0 py-4 pr-4'>
					{/* Floating white "artifact" card — bg-background + shadow + rounded
					    + thin border. Inner content is unchanged. */}
					<div className='h-full bg-background border border-border shadow-lg rounded-2xl overflow-hidden'>
						<SchemaArtifactPanel
							tables={tables}
							sqlPlain={sqlTable}
							seedPlain={sqlSeedData}
							projectId={project.data?.id}
						/>
					</div>
				</Panel>
			</PanelGroup>
		</div>
	);
}

// ── Left: refine chat ───────────────────────────────────────────────────

function SchemaChatPane({
	turns,
	stream,
	hasSlug,
}: {
	turns: ReturnType<typeof mergeHistoryWithLive>;
	stream: ReturnType<typeof useSchemaStream>;
	hasSlug: boolean;
}) {
	const bottomRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [turns, stream.currentNode]);

	// Once the assistant starts producing text it lands in `turns`; before that
	// (decision / schema / sql nodes running) show the node label as progress.
	const showProgress = stream.isStreaming && !stream.liveAssistant;

	return (
		<div className='flex flex-col h-full min-h-0 min-w-0'>
			<div className='flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-4'>
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
					<MessageRow key={t.id} role={t.role}>
						<TextBubble role={t.role} text={t.text || (t.role === 'assistant' ? '…' : '')} />
					</MessageRow>
				))}

				{showProgress && (
					<MessageRow role='assistant'>
						<ThinkingIndicator label={stream.currentNode ?? 'Thinking'} />
					</MessageRow>
				)}

				{stream.streamError && (
					<p className='text-xs text-red-500'>{stream.streamError}</p>
				)}

				<div ref={bottomRef} />
			</div>

			<ChatComposer
				showAgentPicker={false}
				showConnectionPicker={false}
				isStreaming={stream.isStreaming}
				onAbort={stream.abort}
				onSend={(text, opts) => stream.sendMessage(text, opts.model)}
				placeholder={
					hasSlug
						? 'Refine the schema, e.g. "add a posts table with an author FK"'
						: 'Describe the database you want to design…'
				}
			/>
		</div>
	);
}

// ── Right: tabbed schema panel ──────────────────────────────────────────

function SchemaArtifactPanel({
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
	const [tab, setTab] = useState<PanelTab>('tables');

	const TABS: { id: PanelTab; label: string }[] = [
		{ id: 'tables', label: `Tables${tables.length ? ` (${tables.length})` : ''}` },
		{ id: 'er', label: 'ER Diagram' },
		{ id: 'sql', label: 'SQL & Seed' },
	];

	return (
		<div className='flex flex-col h-full min-h-0 min-w-0'>
			<div className='flex items-center gap-1 px-3 py-2 shrink-0'>
				{TABS.map((t) => (
					<button
						key={t.id}
						type='button'
						onClick={() => setTab(t.id)}
						className={cn(
							'px-3 py-1 text-xs rounded-md transition-colors',
							tab === t.id
								? 'bg-sidebar-accent text-foreground font-medium'
								: 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60',
						)}
					>
						{t.label}
					</button>
				))}
			</div>

			<div className='flex-1 overflow-y-auto overflow-x-hidden p-4'>
				{tab === 'tables' && <TablesTab tables={tables} />}
				{tab === 'er' && <ErTab tables={tables} />}
				{tab === 'sql' && (
					<SqlTab sqlPlain={sqlPlain} seedPlain={seedPlain} projectId={projectId} />
				)}
			</div>
		</div>
	);
}

// ── Tab: Tables (card grid) ─────────────────────────────────────────────

function TablesTab({ tables }: { tables: ParsedTable[] }) {
	if (tables.length === 0) {
		return <EmptyHint text='Tables will appear here as the agent designs the schema.' />;
	}
	return (
		<div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
			{tables.map((t) => (
				<TableCard key={t.name} table={t} />
			))}
		</div>
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
								{isPK && <KeyRound className='size-3 text-amber-500 shrink-0' />}
								{!isPK && isFK && <Link2 className='size-3 text-blue-500 shrink-0' />}
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

// ── Tab: SQL & Seed (with dialect picker) ───────────────────────────────

function SqlTab({
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
		if (variants[dialect]) return;
		if (variantMutation.isPending) return;
		variantMutation
			.mutateAsync({ projectId, dialect })
			.then((data) => setVariants((prev) => ({ ...prev, [dialect]: data })))
			.catch(() => {
				// error surfaced via variantMutation.isError below
			});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [dialect, projectId]);

	const displaySql = dialect === 'plain' ? sqlPlain : variants[dialect]?.sql_table ?? null;
	const displaySeed =
		dialect === 'plain' ? seedPlain : variants[dialect]?.sql_seed_data ?? null;
	const hasAnything = !!(displaySql || displaySeed);

	return (
		<div className='space-y-3'>
			<div className='flex items-center justify-end'>
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
				<>
					{displaySql && <CodeBlock title='CREATE TABLE' language='sql' body={displaySql} />}
					{displaySeed && <CodeBlock title='Seed data' language='sql' body={displaySeed} />}
				</>
			)}

			{variantMutation.isError && (
				<p className='text-xs text-red-500'>Failed to load {dialect} variant. Try again.</p>
			)}
		</div>
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
			<pre className='p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap'>{body}</pre>
		</div>
	);
}

// ── Tab: ER diagram ─────────────────────────────────────────────────────

function ErTab({ tables }: { tables: ParsedTable[] }) {
	const { nodes, edges } = useMemo(() => buildErGraph(tables), [tables]);

	if (tables.length === 0) {
		return (
			<EmptyHint text='Relationships will be inferred from foreign keys once tables exist.' />
		);
	}

	return (
		<div className='h-[calc(100%-0px)] min-h-[400px] border border-border rounded-md overflow-hidden bg-background'>
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
	);
}

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

			const refMatch = col.constraints.match(/REFERENCES\s+(\w+)\s*\(/i);
			if (refMatch) {
				targetTable = refMatch[1];
			} else if (col.name.toLowerCase().endsWith('_id')) {
				const base = col.name.slice(0, -3).toLowerCase();
				targetTable = tables.find(
					(t) => t.name.toLowerCase() === base || t.name.toLowerCase() === `${base}s`,
				)?.name;
			}
			if (!targetTable || targetTable === table.name) continue;

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

// ── Shared ──────────────────────────────────────────────────────────────

function EmptyHint({ text }: { text: string }) {
	return (
		<div className='border border-dashed border-border rounded-md p-6 text-center text-xs text-muted-foreground'>
			{text}
		</div>
	);
}
