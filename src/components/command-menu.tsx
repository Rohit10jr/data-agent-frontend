import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { DatabaseIcon, MessageSquareIcon } from 'lucide-react';

import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandList,
} from '@/components/ui/command';
import { useRegisterCommandMenuCallback } from '@/contexts/command-menu-callback';
import { useSearchChatsQuery } from '@/queries/use-search-chats-query';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { TextShimmer } from '@/components/ui/text-shimmer';

export function CommandMenu() {
	const [open, setOpen] = useState(false);
	const [searchValue, setSearchValue] = useState('');
	const debouncedSearch = useDebouncedValue(searchValue, 300);
	const navigate = useNavigate();

	const toggleOpen = useCallback(() => setOpen((prev) => !prev), []);
	useRegisterCommandMenuCallback(toggleOpen, [toggleOpen]);

	const { data: searchResults, isFetching: isSearching } = useSearchChatsQuery(debouncedSearch, {
		enabled: open && debouncedSearch.length >= 2,
	});

	const isSearchMode = searchValue.length >= 2;
	const hasSearchResults = isSearchMode && searchResults && searchResults.length > 0;
	const isPendingSearch = isSearchMode && (searchValue !== debouncedSearch || isSearching);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen((prev) => !prev);
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, []);

	const handleOpenChange = useCallback((isOpen: boolean) => {
		setOpen(isOpen);
		if (!isOpen) {
			setSearchValue('');
		}
	}, []);

	const runCommand = useCallback((command: () => void) => {
		setOpen(false);
		setSearchValue('');
		command();
	}, []);

	const openResult = useCallback(
		(result: { agent: 'sql' | 'schema'; threadId: string }) => {
			if (result.agent === 'schema') {
				navigate({ to: '/schema/$slug', params: { slug: result.threadId } });
			} else {
				navigate({ to: '/$chatId', params: { chatId: result.threadId } });
			}
		},
		[navigate],
	);

	const showNoResults = !hasSearchResults && !isPendingSearch && isSearchMode;

	return (
		<CommandDialog open={open} onOpenChange={handleOpenChange} shouldFilter={false} loop>
			<CommandInput
				placeholder='Search conversations...'
				value={searchValue}
				onValueChange={setSearchValue}
			/>
			<CommandList>
				{showNoResults && <CommandEmpty>No results found.</CommandEmpty>}

				{!isSearchMode && (
					<CommandEmpty>Type at least 2 characters to search your chats.</CommandEmpty>
				)}

				{hasSearchResults ? (
					<CommandGroup heading='Search results'>
						{searchResults.map((result) => (
							<CommandItem
								key={`${result.agent}-${result.threadId}`}
								value={`search-${result.agent}-${result.threadId}`}
								onSelect={() => runCommand(() => openResult(result))}
							>
								{result.agent === 'schema' ? <DatabaseIcon /> : <MessageSquareIcon />}
								<div className='flex flex-col gap-0.5 overflow-hidden'>
									<span className='truncate'>{highlightMatch(result.title, debouncedSearch)}</span>
									{result.matchedText && (
										<span className='text-muted-foreground truncate text-xs'>
											{highlightMatch(result.matchedText, debouncedSearch)}
										</span>
									)}
								</div>
							</CommandItem>
						))}
					</CommandGroup>
				) : isPendingSearch ? (
					<div className='px-4 py-3'>
						<TextShimmer text='Searching deeper...' />
					</div>
				) : null}
			</CommandList>
		</CommandDialog>
	);
}

function highlightMatch(text: string, query: string) {
	if (!query) {
		return text;
	}

	const lowerText = text.toLowerCase();
	const lowerQuery = query.toLowerCase();
	const index = lowerText.indexOf(lowerQuery);

	if (index === -1) {
		return text;
	}

	const before = text.slice(0, index);
	const match = text.slice(index, index + query.length);
	const after = text.slice(index + query.length);

	return (
		<>
			{before}
			<span className='font-semibold text-foreground'>{match}</span>
			{after}
		</>
	);
}
