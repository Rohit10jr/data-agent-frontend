import { createFileRoute } from '@tanstack/react-router';
import { useSession } from '@/lib/auth-client';
import { capitalize } from '@/lib/utils';
import { ChatComposer } from '@/components/chat-composer';
import { useNewChatStream } from '@/queries/use-new-chat-stream';
import { MobileHeader } from '@/components/mobile-header';

export const Route = createFileRoute('/_sidebar-layout/_chat-layout/')({
	component: HomePage,
});

function HomePage() {
	const { data: session } = useSession();
	const username = session?.user?.name;
	const { sendMessage, abort, isStreaming, streamError } = useNewChatStream();

	const greeting = `${username ? capitalize(username) : 'Hello'}, what do you want to analyze?`;

	return (
		<div className='flex flex-col h-full flex-1 bg-panel min-w-72 overflow-hidden'>
			<MobileHeader />

			<div className='flex flex-1 flex-col items-center justify-center gap-4 p-4'>
				<h1 className='text-xl md:text-3xl tracking-tight text-center px-6 mb-2'>{greeting}</h1>
				<p className='text-sm text-muted-foreground text-center max-w-md'>
					Pick a database below, then ask any question about your data.
				</p>
			</div>

			{streamError && (
				<p className='max-w-3xl mx-auto pb-2 text-sm text-red-500 text-center'>{streamError}</p>
			)}

			<ChatComposer
				onSend={sendMessage}
				onAbort={abort}
				isStreaming={isStreaming}
				showConnectionPicker
			/>
		</div>
	);
}
