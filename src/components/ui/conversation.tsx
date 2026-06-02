// Sticky-scroll wrapper for chat surfaces. Built on top of `use-stick-to-bottom`
// which uses requestAnimationFrame-based interpolation — much smoother than
// repeated `scrollIntoView({ behavior: 'smooth' })` calls, which interrupt each
// other's animations and produce visible jerk during the post-stream cascade.
//
// Usage:
//   <Conversation>
//     <ConversationContent>
//       {/* messages */}
//       {/* a child component must call `useScrollToBottomOnNewUserMessage` to
//           snap when the user sends a new message — see that hook */}
//     </ConversationContent>
//     <ConversationScrollButton />
//   </Conversation>

import { ArrowDownIcon } from 'lucide-react';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import type { ComponentProps } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export const Conversation = ({ className, ...props }: ConversationProps) => (
	<StickToBottom
		className={cn('relative flex-1 overflow-y-hidden', className)}
		initial='instant'
		resize='instant'
		{...props}
	/>
);

export type ConversationContentProps = ComponentProps<typeof StickToBottom.Content>;

export const ConversationContent = ({ className, children, ...props }: ConversationContentProps) => (
	<StickToBottom.Content className={cn('flex flex-col gap-4 p-4 md:p-6', className)} {...props}>
		{children}
	</StickToBottom.Content>
);

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

/**
 * Floating "scroll to bottom" button that fades in only when the user has
 * scrolled away from the bottom — appears DURING streaming if they wandered
 * up to re-read, lets them rejoin the live stream with one click.
 */
export const ConversationScrollButton = ({ className, ...props }: ConversationScrollButtonProps) => {
	const { isAtBottom, scrollToBottom } = useStickToBottomContext();

	if (isAtBottom) return null;

	return (
		<Button
			className={cn(
				'absolute bottom-4 left-[50%] -translate-x-1/2 rounded-full hover:bg-background',
				className,
			)}
			onClick={() => scrollToBottom()}
			size='icon-sm'
			type='button'
			variant='outline'
			{...props}
		>
			<ArrowDownIcon className='size-4' />
		</Button>
	);
};
