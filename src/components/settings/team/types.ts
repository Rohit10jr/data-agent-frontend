import type { UserRole } from '@nao/shared/types';

export interface TeamMember {
	id: string;
	name: string;
	firstName?: string;
	lastName?: string;
	email: string;
	role: UserRole;
}
