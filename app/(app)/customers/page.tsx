import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import CustomersList from './CustomersList';

export const dynamic = 'force-dynamic';

export default async function CustomersPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'customers.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }

  const customers = await query<{
    id: string;
    type: string;
    display_name: string;
    email: string | null;
    phone: string | null;
    company_name: string | null;
    siret: string | null;
    nb_sales: string;
    last_visit: string | null;
    total_ttc: string;
    loyalty_points: string | null;
    default_discount_pct: string | null;
  }>(
    `SELECT c.id, c.type,
            COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS display_name,
            c.email, c.phone, c.company_name, c.siret,
            c.default_discount_pct::text,
            COUNT(s.id)::text AS nb_sales,
            MAX(s.validated_at)::text AS last_visit,
            COALESCE(SUM(s.total_ttc),0)::text AS total_ttc,
            (SELECT la.points_balance::text FROM loyalty_accounts la
              WHERE la.customer_id = c.id) AS loyalty_points
       FROM customers c
       LEFT JOIN sales s ON s.customer_id = c.id AND s.status = 'validated'
      WHERE c.organization_id = $1 AND c.is_anonymized = FALSE
      GROUP BY c.id
      ORDER BY MAX(s.validated_at) DESC NULLS LAST, c.created_at DESC
      LIMIT 200`,
    [user.organizationId],
  );

  return (
    <CustomersList
      customers={customers.rows}
      canWrite={(await userCan(user, 'customers.write'))}
    />
  );
}
