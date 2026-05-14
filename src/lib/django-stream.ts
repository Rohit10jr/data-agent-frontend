// POST a message to Django's /api/sql-agent/ and parse the SSE stream.
// Calls onEvent for each parsed event. Caller passes an AbortSignal to cancel.

import { tokens } from './tokens';

export type AgentEvent =
	| { type: 'thread_created'; thread_id: string; connection_id: string }
	| { type: 'token'; kind?: 'reasoning' | 'text'; node?: string; text: string }
	| { type: 'tool_start'; name: string; args: Record<string, unknown> }
	| { type: 'tool_result'; name: string; content: string }
	| { type: 'result'; result_type: string; result_id: string; content: Record<string, unknown> }
	| { type: 'done'; text: string }
	| { type: 'title'; thread_id: string; title: string }
	| { type: 'error'; error: string };

// Schema-agent SSE event shapes. Same SSE wire format as the SQL agent, but
// emits a different mix of events (no tool_start / tool_result; instead
// node_start for progress and structured `result` payloads for SCHEMA / SQL).
export type SchemaAgentEvent =
	| { type: 'thread_created'; slug: string }
	| { type: 'node_start'; node: string; label: string }
	| { type: 'token'; kind?: 'text'; node?: string; text: string }
	| {
			type: 'result';
			result_type: 'SCHEMA';
			content: { schema_table: string };
	  }
	| {
			type: 'result';
			result_type: 'SQL';
			content: { sql_table: string; sql_seed_data: string };
	  }
	| { type: 'done'; text: string }
	| { type: 'title'; slug: string; title: string }
	| { type: 'error'; error: string };

interface StreamArgs {
	query: string;
	threadId?: string;          // omit for new chat
	connectionId?: string;       // required when threadId is omitted
	secureData?: boolean;
	model?: string;              // Groq model id (sql_agent.SUPPORTED_MODELS)
	signal?: AbortSignal;
	onEvent: (event: AgentEvent) => void;
}

interface SchemaStreamArgs {
	query: string;
	slug?: string;               // omit to start a new schema project
	signal?: AbortSignal;
	onEvent: (event: SchemaAgentEvent) => void;
}

/** Generic SSE consumer — POSTs a JSON body and parses `data: <json>\n\n` frames. */
async function consumeSse<E>(
	url: string,
	body: Record<string, unknown>,
	onEvent: (event: E) => void,
	signal?: AbortSignal,
): Promise<void> {
	const access = tokens.getAccess();
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(access ? { Authorization: `Bearer ${access}` } : {}),
		},
		body: JSON.stringify(body),
		signal,
	});

	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`Agent request failed (${res.status}): ${text || res.statusText}`);
	}
	if (!res.body) {
		throw new Error('Response has no body');
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });

			let sepIdx: number;
			while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
				const rawEvent = buffer.slice(0, sepIdx);
				buffer = buffer.slice(sepIdx + 2);

				for (const line of rawEvent.split('\n')) {
					if (!line.startsWith('data:')) continue;
					const payload = line.slice(5).trim();
					if (!payload) continue;
					try {
						onEvent(JSON.parse(payload) as E);
					} catch (err) {
						console.warn('[django-stream] bad event payload:', payload, err);
					}
				}
			}
		}
	} finally {
		reader.releaseLock();
	}
}

export function streamSqlAgent({
	query,
	threadId,
	connectionId,
	secureData = false,
	model,
	signal,
	onEvent,
}: StreamArgs): Promise<void> {
	return consumeSse<AgentEvent>(
		'/api/sql-agent/',
		{
			query,
			thread_id: threadId,
			connection_id: connectionId,
			secure_data: secureData,
			model,
		},
		onEvent,
		signal,
	);
}

export function streamSchemaAgent({
	query,
	slug,
	signal,
	onEvent,
}: SchemaStreamArgs): Promise<void> {
	return consumeSse<SchemaAgentEvent>(
		'/api/schema-agent/',
		{
			query,
			// Backend's MessageSerializer expects `thread_id`; the schema agent
			// uses the same field as the slug.
			thread_id: slug,
		},
		onEvent,
		signal,
	);
}
