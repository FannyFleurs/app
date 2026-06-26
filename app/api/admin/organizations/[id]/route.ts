import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

/** Détail complet d'une organisation pour l'admin SaaS. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requireSuperAdmin();
  if ('response' in g) return g.response;

  const orgRes = await query(
    `SELECT id, name, legal_name, slug, siret, vat_number,
            address, contact, plan, trial_ends_at, created_at,
            COALESCE(max_devices, 1) AS max_devices
       FROM organizations WHERE id = $1`,
    [params.id],
  );
  if (orgRes.rowCount === 0) return jsonError('NOT_FOUND', 404);

  const sub = await query(
    `SELECT plan, status, current_period_start, current_period_end,
            cancel_at_period_end, external_ref, created_at, updated_at
       FROM subscriptions WHERE organization_id = $1`,
    [params.id],
  );

  const stats = await query<{
    user_count: string; sale_count: string;
    total_ttc: string; last_sale_at: string | null;
  }>(
    `SELECT
        (SELECT COUNT(*)::text FROM users WHERE organization_id = $1) AS user_count,
        (SELECT COUNT(*)::text FROM sales WHERE organization_id = $1 AND status = 'validated') AS sale_count,
        (SELECT COALESCE(SUM(total_ttc), 0)::text FROM sales
          WHERE organization_id = $1 AND status = 'validated') AS total_ttc,
        (SELECT MAX(validated_at) FROM sales
          WHERE organization_id = $1 AND status = 'validated') AS last_sale_at`,
    [params.id],
  );

  const events = await query(
    `SELECT se.id, se.event_type, se.payload, se.created_at,
            u.full_name AS performed_by_name, u.email AS performed_by_email
       FROM subscription_events se
       LEFT JOIN users u ON u.id = se.performed_by
      WHERE se.organization_id = $1
      ORDER BY se.created_at DESC LIMIT 100`,
    [params.id],
  ).catch(() => ({ rows: [] }));

  return NextResponse.json({
    organization: orgRes.rows[0],
    subscription: sub.rows[0] ?? null,
    stats: stats.rows[0],
    events: events.rows,
  });
}
