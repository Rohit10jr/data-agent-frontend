import { createFileRoute } from '@tanstack/react-router';

import { SchemaViewer } from '@/components/schema-viewer';

export const Route = createFileRoute('/_sidebar-layout/schema/$slug')({
	component: SchemaDetailPage,
});

function SchemaDetailPage() {
	const { slug } = Route.useParams();
	return <SchemaViewer slug={slug} />;
}
