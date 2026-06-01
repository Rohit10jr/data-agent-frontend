// Singleton store holding the schema agent's live stream state.
//
// Why this exists: `useSchemaStream` is consumed by two separate components —
// the home page (new-thread flow) and the schema-viewer page (refine flow).
// When a new-thread stream starts, the home page mounts the hook, but
// `commitNavigation()` unmounts the home page on the first `node_start` event.
// React state lives per-hook-instance, so any events that arrive after the
// navigation (node labels, error banners) update the dying home-page hook's
// state, which never renders. The freshly mounted schema-viewer hook has no
// connection to that stream and shows empty state.
//
// Lifting the display state to a singleton store fixes this: both hook
// instances subscribe to the SAME state via `useSyncExternalStore`, so events
// surface in whichever component is currently mounted.
//
// Control state (abort controller, run id) deliberately stays per-hook —
// fixing cross-hook abort is a separate concern.

import { Store } from './abstract-store';
import type { AgentErrorPayload } from '@/lib/django-stream';

export interface LiveTurn {
	role: 'user' | 'assistant';
	text: string;
}

export interface SchemaStreamState {
	liveUser: LiveTurn | null;
	liveAssistant: LiveTurn | null;
	currentNode: string | null;
	liveSchemaTable: string | null;
	liveSqlTable: string | null;
	liveSqlSeed: string | null;
	isStreaming: boolean;
	streamError?: AgentErrorPayload;
}

const INITIAL_STATE: SchemaStreamState = {
	liveUser: null,
	liveAssistant: null,
	currentNode: null,
	liveSchemaTable: null,
	liveSqlTable: null,
	liveSqlSeed: null,
	isStreaming: false,
	streamError: undefined,
};

class SchemaStreamStore extends Store<SchemaStreamState> {
	protected state: SchemaStreamState = INITIAL_STATE;

	/** Replace the entire state with the initial empty snapshot. */
	reset = (): void => {
		this.state = INITIAL_STATE;
		this.notify();
	};

	/** Shallow-merge updates into the current state. */
	patch = (updates: Partial<SchemaStreamState>): void => {
		this.state = { ...this.state, ...updates };
		this.notify();
	};

	/** Appends to liveAssistant.text — separate method because it reads prior state. */
	appendAssistantText = (delta: string): void => {
		const prev = this.state.liveAssistant;
		this.state = {
			...this.state,
			liveAssistant: { role: 'assistant', text: (prev?.text ?? '') + delta },
		};
		this.notify();
	};

	/**
	 * `useSyncExternalStore` requires this returns reference-equal snapshots
	 * when state is unchanged. `this.state` is only re-assigned in patch/reset,
	 * so identity is preserved between updates.
	 */
	getSnapshot = (): SchemaStreamState => this.state;
}

export const schemaStreamStore = new SchemaStreamStore();
