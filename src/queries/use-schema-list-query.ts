// Query hooks for the schema agent's project list, detail (incl. history),
// rename, and delete. Mirrors the SQL agent's chat-list shape so the sidebar
// can render both side by side with the same item component.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export interface SchemaProjectListItem {
	id: number;
	slug: string;
	name: string;
	description: string | null;
	/** epoch milliseconds — adapted from Django's ISO `created_at` */
	createdAt: number;
	/** epoch milliseconds — adapted from Django's ISO `updated_at` (used for "Xd ago") */
	updatedAt: number;
}

interface DjangoSchemaProject {
	id: number;
	slug: string;
	name: string | null;
	description: string | null;
	created_at?: string;
	updated_at?: string;
}

const adaptSchemaProject = (p: DjangoSchemaProject): SchemaProjectListItem => {
	const created = p.created_at ? new Date(p.created_at).getTime() : Date.now();
	const updated = p.updated_at ? new Date(p.updated_at).getTime() : created;
	return {
		id: p.id,
		slug: p.slug,
		name: p.name ?? 'New Project',
		description: p.description ?? null,
		createdAt: created,
		updatedAt: updated,
	};
};

export interface SchemaHistoryTurn {
	id: number;
	role: 'user' | 'assistant';
	text: string;
}

export interface SchemaProjectDetail {
	id: number;
	slug: string;
	name: string | null;
	user: number;
	schema_table: string | null;
	sql_table: string | null;
	sql_seed_data: string | null;
	created_at: string;
	updated_at: string;
	messages: SchemaHistoryTurn[];
}

export const SCHEMA_LIST_QUERY_KEY = ['schema', 'list'] as const;
export const schemaProjectQueryKey = (slug: string) => ['schema', 'project', slug] as const;

export const useSchemaListQuery = () => {
	return useQuery<SchemaProjectListItem[]>({
		queryKey: SCHEMA_LIST_QUERY_KEY,
		queryFn: async () => {
			const rows = await api.get<DjangoSchemaProject[]>('/schema-projects/');
			return rows.map(adaptSchemaProject);
		},
	});
};

export const useSchemaProjectQuery = (slug: string | undefined) => {
	return useQuery<SchemaProjectDetail>({
		queryKey: schemaProjectQueryKey(slug ?? ''),
		queryFn: () => api.get<SchemaProjectDetail>(`/schema-project/${slug}/`),
		enabled: !!slug,
	});
};

export const useSchemaRenameMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ slug, name }: { slug: string; name: string }) =>
			api.patch<SchemaProjectDetail>(`/schema-project/${slug}/`, { name }),
		onSuccess: (_data, vars) => {
			qc.setQueryData<SchemaProjectListItem[]>(SCHEMA_LIST_QUERY_KEY, (prev) =>
				prev ? prev.map((p) => (p.slug === vars.slug ? { ...p, name: vars.name } : p)) : prev,
			);
			qc.invalidateQueries({ queryKey: schemaProjectQueryKey(vars.slug) });
		},
	});
};

export const useSchemaDeleteMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (slug: string) => api.delete<void>(`/schema-project/${slug}/`),
		onSuccess: (_data, slug) => {
			qc.setQueryData<SchemaProjectListItem[]>(SCHEMA_LIST_QUERY_KEY, (prev) =>
				prev ? prev.filter((p) => p.slug !== slug) : prev,
			);
			qc.removeQueries({ queryKey: schemaProjectQueryKey(slug) });
		},
	});
};

// ── SQL dialect variants ─────────────────────────────────────────────
// The backend transpiles project.sql_json / project.seed_json into the
// requested dialect via sqlglot and caches the result in project.variants.

export type SqlDialect = 'postgres' | 'mysql' | 'tsql' | 'snowflake' | 'sqlite';

export interface SqlVariantResponse {
	sql_table: string;
	sql_seed_data: string;
}

export const useSchemaVariantMutation = () => {
	return useMutation({
		mutationFn: ({ projectId, dialect }: { projectId: number; dialect: SqlDialect }) =>
			api.post<SqlVariantResponse>('/schema-variants/', {
				project_id: projectId,
				sql_type: dialect,
			}),
	});
};
