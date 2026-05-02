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

interface StreamArgs {
	query: string;
	threadId?: string;          // omit for new chat
	connectionId?: string;       // required when threadId is omitted
	secureData?: boolean;
	model?: string;              // Groq model id (sql_agent.SUPPORTED_MODELS)
	signal?: AbortSignal;
	onEvent: (event: AgentEvent) => void;
}

export async function streamSqlAgent({
	query,
	threadId,
	connectionId,
	secureData = false,
	model,
	signal,
	onEvent,
}: StreamArgs): Promise<void> {
	const access = tokens.getAccess();
	const res = await fetch('/api/sql-agent/', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(access ? { Authorization: `Bearer ${access}` } : {}),
		},
		body: JSON.stringify({
			query,
			thread_id: threadId,
			connection_id: connectionId,
			secure_data: secureData,
			model,
		}),
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

			// SSE is "data: <json>\n\n" — split on double newline.
			let sepIdx: number;
			while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
				const rawEvent = buffer.slice(0, sepIdx);
				buffer = buffer.slice(sepIdx + 2);

				// Each event may have multiple lines; we only consume "data: ..."
				for (const line of rawEvent.split('\n')) {
					if (!line.startsWith('data:')) continue;
					const payload = line.slice(5).trim();
					if (!payload) continue;
					try {
						const event = JSON.parse(payload) as AgentEvent;
						onEvent(event);
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
