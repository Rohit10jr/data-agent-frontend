// Unauthenticated entry route. Django backend has no user-count / cloud-mode
// concept the way nao did, so always send users to /login. They can click
// "Sign up" from there if they don't have an account.
export function useAuthRoute(): string {
	return '/login';
}
