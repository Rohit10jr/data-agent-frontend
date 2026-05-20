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
import {
	AlertTriangle,
	Check,
	Database,
	Download,
	KeyRound,
	Link2,
	Loader2,
	Pencil,
	X,
} from 'lucide-react';
import Editor from '@monaco-editor/react';

import {
	type SqlDialect,
	type SqlVariantResponse,
	useSchemaProjectQuery,
	useSchemaSqlEditMutation,
	useSchemaVariantMutation,
} from '@/queries/use-schema-list-query';
import {
	mergeHistoryWithLive,
	pickLatestArtifacts,
	useSchemaStream,
} from '@/queries/use-schema-stream';
import { ChatComposer } from '@/components/chat-composer';
import { MessageRow, TextBubble, ThinkingIndicator } from '@/components/chat/chat-primitives';
import { chatActivityStore } from '@/stores/chat-activity';
import { cn } from '@/lib/utils';

// Structured schema IR — matches the backend DatabaseSchema produced by the
// schema agent's generate_schema tool (core/services/schema_graph.py).
interface Column {
	name: string;
	type: string;
	nullable?: boolean;
	primary_key?: boolean;
	unique?: boolean;
	default?: string | null;
	check?: string | null;
	description?: string;
}
interface ForeignKey {
	column: string;
	references_table: string;
	references_column?: string;
	on_delete?: string;
}
interface IndexDefinition {
	name: string;
	columns: string[];
	unique?: boolean;
}
interface ParsedTable {
	name: string;
	purpose?: string;
	columns: Column[];
	foreign_keys: ForeignKey[];
	indexes: IndexDefinition[];
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
		const tables = Array.isArray(obj?.tables) ? obj.tables : [];
		// Normalise — older artifacts may omit foreign_keys / indexes.
		return tables.map(
			(t: Partial<ParsedTable>): ParsedTable => ({
				name: t.name ?? '',
				purpose: t.purpose,
				columns: Array.isArray(t.columns) ? t.columns : [],
				foreign_keys: Array.isArray(t.foreign_keys) ? t.foreign_keys : [],
				indexes: Array.isArray(t.indexes) ? t.indexes : [],
			}),
		);
	} catch {
		return [];
	}
}

export function SchemaViewer({ slug }: Props) {
	const project = useSchemaProjectQuery(slug);
	const stream = useSchemaStream({ slug });

	// Clear the sidebar unread dot when this project is actually opened.
	useEffect(() => {
		if (slug) chatActivityStore.setUnread(slug, false);
	}, [slug]);

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
							projectName={project.data?.name ?? null}
							slug={slug}
							sqlEditedManually={project.data?.sql_edited_manually ?? false}
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
	projectName,
	slug,
	sqlEditedManually,
}: {
	tables: ParsedTable[];
	sqlPlain: string | null;
	seedPlain: string | null;
	projectId: number | undefined;
	projectName: string | null;
	slug: string | undefined;
	sqlEditedManually: boolean;
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
				{tab === 'tables' && (
					<>
						{sqlEditedManually && <ManualEditBadge />}
						<TablesTab tables={tables} />
					</>
				)}
				{tab === 'er' && (
					<>
						{sqlEditedManually && <ManualEditBadge />}
						<ErTab tables={tables} />
					</>
				)}
				{tab === 'sql' && (
					<SqlTab
						sqlPlain={sqlPlain}
						seedPlain={seedPlain}
						projectId={projectId}
						projectName={projectName}
						slug={slug}
					/>
				)}
			</div>
		</div>
	);
}

// Small amber banner shown on Tables / ER tabs when the user has hand-edited
// the SQL since the last agent regeneration — those views are derived from
// `schema_json` and may have diverged from the edited SQL.
function ManualEditBadge() {
	return (
		<div className='mb-3 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-md px-3 py-2'>
			<AlertTriangle className='size-3.5 shrink-0' />
			<span>SQL was edited manually — this view may be out of date.</span>
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
	const fkColumns = new Set(table.foreign_keys.map((fk) => fk.column));
	return (
		<div className='border border-border rounded-lg overflow-hidden bg-background hover:border-foreground/30 transition-colors'>
			<div className='flex items-center justify-between px-3 py-2 bg-sidebar-accent border-b border-border'>
				<span className='font-mono text-sm font-semibold'>{table.name}</span>
				<Database className='size-3.5 text-muted-foreground' />
			</div>
			<div className='divide-y divide-border'>
				{table.columns.map((col) => {
					const isPK = !!col.primary_key;
					const isFK = fkColumns.has(col.name);
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
								{!col.nullable && <span className='ml-1 text-amber-600/70'>•</span>}
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
	projectName,
	slug,
}: {
	sqlPlain: string | null;
	seedPlain: string | null;
	projectId: number | undefined;
	projectName: string | null;
	slug: string | undefined;
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

	// Editing is only meaningful for the plain (source) SQL — transpiled
	// variants are regenerated from the source on demand.
	const canEdit = dialect === 'plain' && !!slug;

	const handleDownload = () => {
		const parts: string[] = [];
		if (displaySql) parts.push(`-- Tables\n${displaySql}`);
		if (displaySeed) parts.push(`-- Seed data\n${displaySeed}`);
		const blob = new Blob([parts.join('\n\n')], { type: 'text/plain;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		const safeName = (projectName || 'schema').replace(/[^a-z0-9_-]/gi, '_');
		const suffix = dialect === 'plain' ? '' : `.${dialect}`;
		a.download = `${safeName}${suffix}.sql`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	};

	return (
		<div className='space-y-3'>
			<div className='flex items-center justify-between gap-2'>
				<button
					type='button'
					onClick={handleDownload}
					disabled={!hasAnything}
					className='inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border border-border hover:bg-sidebar-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
					title='Download as .sql file'
				>
					<Download className='size-3.5' />
					Download .sql
				</button>
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
					{displaySql !== null && (
						<EditableCodeBlock
							title='CREATE TABLE'
							body={displaySql}
							slug={slug}
							canEdit={canEdit}
							field='sqlTable'
						/>
					)}
					{displaySeed !== null && (
						<EditableCodeBlock
							title='Seed data'
							body={displaySeed}
							slug={slug}
							canEdit={canEdit}
							field='sqlSeedData'
						/>
					)}
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

// SQL block with an optional inline Monaco editor. View mode renders the
// existing pre-formatted text; Edit flips to Monaco and exposes Save/Cancel.
// `canEdit` is false for transpiled dialects (Postgres / MySQL / …) so users
// don't try to edit derived output.
function EditableCodeBlock({
	title,
	body,
	slug,
	canEdit,
	field,
}: {
	title: string;
	body: string;
	slug: string | undefined;
	canEdit: boolean;
	field: 'sqlTable' | 'sqlSeedData';
}) {
	const editMutation = useSchemaSqlEditMutation();
	const [isEditing, setIsEditing] = useState(false);
	const [draft, setDraft] = useState(body);

	// When the body changes from outside (agent regeneration, project re-fetch)
	// and we're not actively editing, mirror it into the draft.
	useEffect(() => {
		if (!isEditing) setDraft(body);
	}, [body, isEditing]);

	const handleSave = async () => {
		if (!slug) return;
		await editMutation.mutateAsync({
			slug,
			...(field === 'sqlTable' ? { sqlTable: draft } : { sqlSeedData: draft }),
		});
		setIsEditing(false);
	};

	const handleCancel = () => {
		setDraft(body);
		setIsEditing(false);
	};

	return (
		<div className='border border-border rounded-md overflow-hidden'>
			<div className='flex items-center justify-between px-3 py-1.5 bg-sidebar-accent border-b border-border text-xs'>
				<span className='font-medium'>{title}</span>
				<div className='flex items-center gap-2'>
					<span className='text-muted-foreground font-mono uppercase text-[10px]'>sql</span>
					{canEdit && !isEditing && (
						<button
							type='button'
							onClick={() => setIsEditing(true)}
							className='inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-background transition-colors'
							title='Edit'
						>
							<Pencil className='size-3' />
							Edit
						</button>
					)}
					{isEditing && (
						<>
							<button
								type='button'
								onClick={handleCancel}
								disabled={editMutation.isPending}
								className='inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-background transition-colors disabled:opacity-50'
								title='Cancel'
							>
								<X className='size-3' />
								Cancel
							</button>
							<button
								type='button'
								onClick={handleSave}
								disabled={editMutation.isPending || draft === body}
								className='inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50'
								title='Save'
							>
								{editMutation.isPending ? (
									<Loader2 className='size-3 animate-spin' />
								) : (
									<Check className='size-3' />
								)}
								Save
							</button>
						</>
					)}
				</div>
			</div>
			{isEditing ? (
				<Editor
					height='240px'
					language='sql'
					value={draft}
					onChange={(v) => setDraft(v ?? '')}
					options={{
						minimap: { enabled: false },
						fontSize: 12,
						lineNumbers: 'off',
						scrollBeyondLastLine: false,
						wordWrap: 'on',
						tabSize: 2,
					}}
				/>
			) : (
				<pre className='p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap'>{body}</pre>
			)}
			{editMutation.isError && (
				<p className='px-3 py-1 text-xs text-red-500 border-t border-border'>
					Failed to save. Please try again.
				</p>
			)}
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
	fkColumns: string[];   // names of columns that are foreign keys
	[key: string]: unknown;
}

function ErTableNode({ data }: { data: ErNodeData }) {
	const fkSet = new Set(data.fkColumns);
	return (
		<div className='bg-background border border-border rounded-md shadow-sm overflow-hidden w-56 text-foreground'>
			<div className='px-2 py-1.5 bg-sidebar-accent border-b border-border text-[11px] font-semibold font-mono text-center'>
				{data.label}
			</div>
			<div className='py-1'>
				{data.columns.map((col) => {
					const isPK = !!col.primary_key;
					const isFK = fkSet.has(col.name);
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
		data: {
			label: t.name,
			columns: t.columns,
			fkColumns: t.foreign_keys.map((fk) => fk.column),
		} satisfies ErNodeData,
	}));

	const tableByName = new Map(tables.map((t) => [t.name, t]));
	const edges: Edge[] = [];
	for (const table of tables) {
		// Edges come straight from the explicit foreign_keys IR — no regex guessing.
		for (const fk of table.foreign_keys) {
			const target = tableByName.get(fk.references_table);
			if (!target || target.name === table.name) continue;

			const pkCol =
				target.columns.find((c) => c.primary_key)?.name ??
				fk.references_column ??
				'id';

			edges.push({
				id: `${table.name}-${fk.column}->${target.name}`,
				source: target.name,
				target: table.name,
				sourceHandle: `${target.name}-${pkCol}-source`,
				targetHandle: `${table.name}-${fk.column}-target`,
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
