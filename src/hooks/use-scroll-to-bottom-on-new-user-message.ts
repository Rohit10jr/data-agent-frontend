import { useEffect } from 'react';
import { useStickToBottomContext } from 'use-stick-to-bottom';

interface MessageLike {
	role: string;
}

/**
 * While a stream is running, force-snap to the bottom whenever the most recent
 * message is from the user. This covers the moment the composer dispatches a
 * new message — without it, the user could send a message while scrolled up
 * (re-reading earlier turns) and never see their own prompt land.
 *
 * Must be called from a component rendered *inside* a `<Conversation>` so the
 * `useStickToBottomContext` provider is reachable.
 */
export function useScrollToBottomOnNewUserMessage<T extends MessageLike>(
	messages: T[],
	isRunning: boolean,
) {
	const { scrollToBottom } = useStickToBottomContext();

	useEffect(() => {
		if (isRunning && messages.at(-1)?.role === 'user') {
			scrollToBottom();
		}
	}, [messages, isRunning, scrollToBottom]);
}
