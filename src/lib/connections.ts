// Typed REST client for Django's connection endpoints.
import { api } from './api';

export type ConnectionType = 'postgres' | 'mysql' | 'mssql' | 'sqlite' | 'csv' | 'excel' | 'sas';

export interface ConnectionTable {
	name: string;
	enabled: boolean;
}

export interface ConnectionSchema {
	name: string;
	enabled: boolean;
	tables: ConnectionTable[];
}

export interface ConnectionOptions {
	schemas?: ConnectionSchema[];
}

export interface Connection {
	id: string;
	name: string;
	dsn: string;
	database: string;
	type: ConnectionType;
	dialect: string | null;
	is_sample: boolean;
	options: ConnectionOptions;
	created_at: string;
}

interface DjangoListResponse<T> {
	data: T;
}

export const connectionsApi = {
	list: async (): Promise<Connection[]> => {
		const res = await api.get<DjangoListResponse<Connection[]>>('/connections/');
		return res.data;
	},

	get: async (id: string): Promise<Connection> => {
		const res = await api.get<DjangoListResponse<Connection>>(`/connection/${id}/`);
		return res.data;
	},

	create: async (input: { dsn: string; name: string }): Promise<Connection> => {
		const res = await api.post<DjangoListResponse<Connection>>('/connect/', input);
		return res.data;
	},

	update: async (
		id: string,
		patch: { name?: string; dsn?: string; options?: ConnectionOptions },
	): Promise<Connection> => {
		const res = await api.patch<DjangoListResponse<Connection>>(`/connection/${id}/`, patch);
		return res.data;
	},

	delete: async (id: string): Promise<void> => {
		await api.delete<void>(`/connection/${id}/`);
	},

	refresh: async (id: string): Promise<Connection> => {
		const res = await api.post<DjangoListResponse<Connection>>(`/connection/${id}/refresh/`);
		return res.data;
	},
};
