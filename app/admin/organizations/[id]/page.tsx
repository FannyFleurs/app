import OrganizationDetail from './OrganizationDetail';

export const dynamic = 'force-dynamic';

export default function AdminOrgDetailPage({ params }: { params: { id: string } }) {
  return <OrganizationDetail id={params.id} />;
}
