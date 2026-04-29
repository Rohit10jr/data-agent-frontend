const ACCESS_KEY = 'auth.access';
const REFRESH_KEY = 'auth.refresh';

export const tokens = {
	getAccess: () => localStorage.getItem(ACCESS_KEY),
	getRefresh: () => localStorage.getItem(REFRESH_KEY),
	set: ({ access, refresh }: { access: string; refresh?: string }) => {
		localStorage.setItem(ACCESS_KEY, access);
		if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
	},
	clear: () => {
		localStorage.removeItem(ACCESS_KEY);
		localStorage.removeItem(REFRESH_KEY);
	},
};
