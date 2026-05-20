export interface SettingsSearchEntry {
	page: string;
	pageLabel: string;
	section?: string;
	title: string;
	description?: string;
	keywords?: string[];
	adminOnly?: boolean;
	cloudHidden?: boolean;
}

export const settingsSearchIndex: SettingsSearchEntry[] = [
	// ── Account ──────────────────────────────────────────────
	{
		page: '/settings/account',
		pageLabel: 'Account',
		title: 'Profile',
		description: 'Manage your name, email, and sign out.',
		keywords: ['name', 'email', 'sign out', 'logout', 'avatar'],
	},
	{
		page: '/settings/account',
		pageLabel: 'Account',
		section: 'General Settings',
		title: 'Sound notification',
		description: 'Play a sound when the agent finishes responding.',
		keywords: ['audio', 'alert', 'notification sound'],
	},
	{
		page: '/settings/account',
		pageLabel: 'Account',
		section: 'General Settings',
		title: 'Theme',
		description: 'Choose how Queryn looks.',
		keywords: ['dark mode', 'light mode', 'appearance', 'color scheme'],
	},
	{
		page: '/settings/account',
		pageLabel: 'Account',
		title: 'Danger Zone',
		description: 'Delete your account or perform other destructive actions.',
		keywords: ['delete account', 'remove'],
	},

	// ── Usage & Costs ────────────────────────────────────────
	{
		page: '/settings/usage',
		pageLabel: 'Usage & Costs',
		title: 'Tokens',
		description: 'Tokens used across all chats.',
		keywords: ['token usage', 'input tokens', 'output tokens'],
	},

	// ── Memory (user-level) ──────────────────────────────────
	{
		page: '/settings/memory',
		pageLabel: 'Memory',
		title: 'Memory',
		description: 'What the assistant remembers about you across conversations — add, edit, or remove anything.',
		keywords: [
			'remember',
			'learn',
			'personalization',
			'preferences',
			'remembered facts',
			'long-term memory',
		],
	},
];
