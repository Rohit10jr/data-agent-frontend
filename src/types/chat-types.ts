// Local re-exports replacing the now-removed @nao/backend/chat module.
// Everything here is sourced from the Vercel ai SDK, which is what nao's
// chat module was wrapping in the first place.

import type {
	UIMessagePart as AiUIMessagePart,
	ToolUIPart as AiToolUIPart,
	UITools as AiUITools,
	UIDataTypes,
} from 'ai';

export type { UIMessage, UITools, UIDataTypes } from 'ai';

/**
 * nao alias for the ai SDK's `ToolUIPart`. nao took an optional tool-name
 * generic; we ignore it since the ai SDK uses a `UITools` record instead.
 */
export type UIToolPart<_TName extends string = string> = AiToolUIPart<AiUITools>;

/** Concrete UIMessagePart with default generics applied. */
export type UIMessagePart = AiUIMessagePart<UIDataTypes, AiUITools>;

/** Name of any static tool. nao defined this as `keyof UITools`. */
export type StaticToolName = keyof AiUITools;

export type { ChatListItem } from '@/queries/use-chat-list-query';
