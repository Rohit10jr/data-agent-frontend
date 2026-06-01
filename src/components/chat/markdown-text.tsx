import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

import { cn } from '@/lib/utils';

interface MarkdownTextProps {
	text: string;
	className?: string;
}

/**
 * Renders an LLM message as markdown — bold, italics, code, lists, tables,
 * links. react-markdown strips raw HTML by default, so the model cannot inject
 * `<script>` or other dangerous tags.
 *
 * Memoized so re-renders during streaming (every token append) don't reparse
 * unchanged content.
 */
export const MarkdownText = memo(function MarkdownText({ text, className }: MarkdownTextProps) {
	return (
		<div className={cn('text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0', className)}>
			<ReactMarkdown
				remarkPlugins={[remarkGfm, remarkBreaks]}
				components={{
					p: ({ children }) => <p className='mb-2 last:mb-0'>{children}</p>,
					strong: ({ children }) => <strong className='font-semibold'>{children}</strong>,
					em: ({ children }) => <em className='italic'>{children}</em>,
					a: ({ children, href }) => (
						<a
							href={href}
							target='_blank'
							rel='noopener noreferrer'
							className='text-primary underline hover:no-underline'
						>
							{children}
						</a>
					),
					code: ({ className: codeClass, children, ...props }) => {
						const isBlock = /language-/.test(codeClass ?? '');
						if (isBlock) {
							return (
								<code className={cn('font-mono text-xs', codeClass)} {...props}>
									{children}
								</code>
							);
						}
						return (
							<code className='bg-muted-foreground/15 px-1 py-0.5 rounded text-[0.85em] font-mono'>
								{children}
							</code>
						);
					},
					pre: ({ children }) => (
						<pre className='my-2 p-3 bg-background border border-border rounded-md overflow-x-auto'>
							{children}
						</pre>
					),
					ul: ({ children }) => <ul className='list-disc pl-6 mb-2 space-y-1'>{children}</ul>,
					ol: ({ children }) => <ol className='list-decimal pl-6 mb-2 space-y-1'>{children}</ol>,
					li: ({ children }) => <li>{children}</li>,
					h1: ({ children }) => <h1 className='text-base font-semibold mt-3 mb-2'>{children}</h1>,
					h2: ({ children }) => <h2 className='text-sm font-semibold mt-3 mb-2'>{children}</h2>,
					h3: ({ children }) => <h3 className='text-sm font-semibold mt-3 mb-2'>{children}</h3>,
					h4: ({ children }) => <h4 className='text-sm font-semibold mt-3 mb-2'>{children}</h4>,
					h5: ({ children }) => <h5 className='text-sm font-semibold mt-3 mb-2'>{children}</h5>,
					h6: ({ children }) => <h6 className='text-sm font-semibold mt-3 mb-2'>{children}</h6>,
					blockquote: ({ children }) => (
						<blockquote className='border-l-2 border-border pl-3 italic text-muted-foreground my-2'>
							{children}
						</blockquote>
					),
					hr: () => <hr className='my-3 border-border' />,
					table: ({ children }) => (
						<div className='my-2 overflow-x-auto'>
							<table className='w-full text-xs border-collapse'>{children}</table>
						</div>
					),
					thead: ({ children }) => <thead className='border-b border-border'>{children}</thead>,
					tr: ({ children }) => <tr className='border-b border-border last:border-0'>{children}</tr>,
					th: ({ children }) => <th className='px-2 py-1 text-left font-semibold'>{children}</th>,
					td: ({ children }) => <td className='px-2 py-1'>{children}</td>,
				}}
			>
				{text}
			</ReactMarkdown>
		</div>
	);
});
