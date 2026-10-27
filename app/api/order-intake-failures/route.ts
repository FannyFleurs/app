import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/**
 * Dernières réceptions de commande externe en échec (jeton invalide/absent
 * excepté : non rattachable à une organisation) — voir
 * app/api/orders/incoming/route.ts et lib/services/order-intake.ts.
 */
export async function GET() {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;

  const { rows } = await query<{
    id: string; created_at: string; action: string;
    payload: Record<string, unknown>;
  }>(
    `SELECT id, created_at::text, action, payload
       FROM audit_logs
      WHERE organization_id = $1
        AND action IN ('order_intake.rejected', 'order_intake.auto_checkout_failed')
      ORDER BY created_at DESC
      LIMIT 200`,
    [g.user.organizationId],
  );
  return NextResponse.json({ failures: rows });
}
