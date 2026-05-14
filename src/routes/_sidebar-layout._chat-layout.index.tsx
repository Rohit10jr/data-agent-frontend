import { createFileRoute } from '@tanstack/react-router';
import { useSession } from '@/lib/auth-client';
import { capitalize } from '@/lib/utils';
import { ChatComposer, type ChatComposerSendOpts } from '@/components/chat-composer';
import { useNewChatStream } from '@/queries/use-new-chat-stream';
import { useSchemaStream } from '@/queries/use-schema-stream';
import { MobileHeader } from '@/components/mobile-header';

export const Route = createFileRoute('/_sidebar-layout/_chat-layout/')({
	component: HomePage,
});

function HomePage() {
	const { data: session } = useSession();
	const username = session?.user?.name;

	// Two independent streaming hooks. The composer's agent picker decides
	// which one receives the next prompt; both keep their own loading state.
	const sqlNew = useNewChatStream();
	const schemaNew = useSchemaStream();

	const isStreaming = sqlNew.isStreaming || schemaNew.isStreaming;
	const streamError = sqlNew.streamError || schemaNew.streamError;
	const abort = () => {
		sqlNew.abort?.();
		schemaNew.abort?.();
	};

	const handleSend = (text: string, opts: ChatComposerSendOpts) => {
		if (opts.agent === 'schema') {
			void schemaNew.sendMessage(text);
		} else {
			void sqlNew.sendMessage(text, {
				connectionId: opts.connectionId,
				model: opts.model,
			});
		}
	};

	const greeting = `${username ? capitalize(username) : 'Hello'}, what do you want to build?`;

	return (
		<div className='flex flex-col h-full flex-1 bg-panel min-w-72 overflow-hidden'>
			<MobileHeader />

			<div className='flex flex-1 flex-col items-center justify-center gap-4 p-4'>
				<h1 className='text-xl md:text-3xl tracking-tight text-center px-6 mb-2'>{greeting}</h1>
				<p className='text-sm text-muted-foreground text-center max-w-md'>
					Pick an agent below, then describe what you want — query an existing database with the
					SQL agent, or design a new schema with the Schema agent.
				</p>
			</div>

			{streamError && (
				<p className='max-w-3xl mx-auto pb-2 text-sm text-red-500 text-center'>{streamError}</p>
			)}

			<ChatComposer
				onSend={handleSend}
				onAbort={abort}
				isStreaming={isStreaming}
				showAgentPicker
				showConnectionPicker
			/>
		</div>
	);
}
