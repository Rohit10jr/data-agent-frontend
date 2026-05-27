import type { ReactNode } from 'react';
import type { ImageUploadData } from '@nao/shared/types';

/** Shape of an at-mention option in the chat input. Inlined from prompt-mentions. */
export interface MentionOption {
	id: string;
	label: string;
	icon?: ReactNode;
	type?: 'item' | 'divider' | 'title';
	children?: MentionOption[];
	labelRight?: string;
	indent?: number;
}

export interface QueuedMessage {
	id: string;
	text: string;
	mentions: MentionOption[];
	images?: ImageUploadData[];
}

export type NewQueuedMessage = Omit<QueuedMessage, 'id'>;
