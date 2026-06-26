import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requireSuperAdmin } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/** Vue agrégée pour le dashboard /admin. */
export async function GET() {
  const g = await requireSuperAdmin();
  if ('response' in g) return g.response;

  const r = await query<{
    total_orgs: string;
    trial_orgs: string;
    active_orgs: string;
    cancelled_orgs: string;
    trial_expiring_soon: string;
    new_orgs_7d: string;
  }>(
    `SELECT
        (SELECT COUNT(*)::text FROM organizations) AS total_orgs,
        (SELECT COUNT(*)::text FROM organizations WHERE plan = 'trial') AS trial_orgs,
        (SELECT COUNT(*)::text FROM subscriptions WHERE status = 'active' AND plan <> 'trial') AS active_orgs,
        (SELECT COUNT(*)::text FROM subscriptions WHERE status = 'cancelled') AS cancelled_orgs,
        (SELECT COUNT(*)::text FROM organizations
          WHERE plan = 'trial' AND trial_ends_at < now() + interval '7 days') AS trial_expiring_soon,
        (SELECT COUNT(*)::text FROM organizations
          WHERE created_at > now() - interval '7 days') AS new_orgs_7d`,
  );
  return NextResponse.json(r.rows[0] ?? {});
}
