import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requireSuperAdmin } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/** Liste cross-tenant des organisations (réservée super_admin SaaS). */
export async function GET() {
  const g = await requireSuperAdmin();
  if ('response' in g) return g.response;

  const { rows } = await query<{
    id: string; slug: string | null;
    name: string; legal_name: string;
    plan: string; trial_ends_at: string | null;
    created_at: string;
    sub_status: string | null;
    sub_plan: string | null;
    sub_period_end: string | null;
    admin_email: string | null;
    user_count: string;
    sale_count: string;
    last_sale_at: string | null;
  }>(
    `SELECT o.id, o.slug, o.name, o.legal_name,
            o.plan, o.trial_ends_at, o.created_at,
            s.status AS sub_status, s.plan AS sub_plan, s.current_period_end AS sub_period_end,
            (SELECT email FROM users
              WHERE organization_id = o.id AND role IN ('owner','super_admin')
              ORDER BY created_at ASC LIMIT 1) AS admin_email,
            (SELECT COUNT(*)::text FROM users WHERE organization_id = o.id) AS user_count,
            (SELECT COUNT(*)::text FROM sales
              WHERE organization_id = o.id AND status = 'validated') AS sale_count,
            (SELECT MAX(validated_at) FROM sales
              WHERE organization_id = o.id AND status = 'validated') AS last_sale_at
       FROM organizations o
       LEFT JOIN subscriptions s ON s.organization_id = o.id
       ORDER BY o.created_at DESC`,
  );

  return NextResponse.json({ organizations: rows });
}
