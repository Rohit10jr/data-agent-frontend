// Local re-exports replacing the now-removed @nao/backend/chat module.
// Everything here is sourced from the Vercel ai SDK, which is what nao's
// chat module was wrapping in the first place.

import type {
	UIMessage as AiUIMessage,
	UIMessagePart as AiUIMessagePart,
	ToolUIPart as AiToolUIPart,
	UITools as AiUITools,
} from 'ai';
import type { ChatListItem } from '@/queries/use-chat-list-query';

// Custom data parts streamed by the agent backend. Adding entries here gives
// `dataPart.data` proper narrowing when the matching `dataPart.type`
// (e.g. 'data-newChat') is checked.
// NOTE: we deliberately do NOT extend the ai SDK's `UIDataTypes`
// (= `Record<string, unknown>`); doing so brings in a wide string index
// signature that swallows the specific keys and turns `data` back into unknown.
export type ChatUIDataTypes = {
	newChat: ChatListItem;
	chatTitleUpdate: { title: string };
	newUserMessage: { newId: string };
	// nao compaction protocol — keys must exist so the type discriminator
	// comparisons in lib/ai.ts type-check. We don't read `.data` on these,
	// so the value shape is just `unknown`.
	compaction: unknown;
	compactionSummaryStarted: unknown;
};

export type UIMessage = AiUIMessage<unknown, ChatUIDataTypes, AiUITools>;

/**
 * nao alias for the ai SDK's `ToolUIPart`. nao took an optional tool-name
 * generic; we ignore it since the ai SDK uses a `UITools` record instead.
 */
export type UIToolPart<_TName extends string = string> = AiToolUIPart<AiUITools>;

/** Concrete UIMessagePart with default generics applied. */
export type UIMessagePart = AiUIMessagePart<ChatUIDataTypes, AiUITools>;

/** Name of any static tool. nao defined this as `keyof UITools`. */
export type StaticToolName = keyof AiUITools;

export type { UITools, UIDataTypes } from 'ai';
export type { ChatListItem } from '@/queries/use-chat-list-query';
