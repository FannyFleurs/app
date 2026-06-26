import { readSessionFromCookie } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import { query } from '@/lib/db/client';
import CompanyAdmin from './CompanyAdmin';

export const dynamic = 'force-dynamic';

export default async function CompanySettingsPage() {
  const user = (await readSessionFromCookie())!;
  if (!hasPermission(user.role, 'settings.read')) {
    return <div className="p-8">Accès refusé.</div>;
  }

  const org = await query<{
    name: string; legal_name: string; siret: string | null; vat_number: string | null;
    address: { line1?: string; line2?: string; zip?: string; city?: string; country?: string } | null;
    contact: { phone?: string; email?: string; website?: string } | null;
  }>(
    `SELECT name, legal_name, siret, vat_number, address, contact
       FROM organizations WHERE id = $1`,
    [user.organizationId],
  );

  return (
    <CompanyAdmin
      org={org.rows[0]!}
      canWrite={hasPermission(user.role, 'settings.write')}
    />
  );
}
