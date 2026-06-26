import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/**
 * Renvoie l'état de l'abonnement de l'organisation courante.
 * Fallback : si la migration 0010 n'est pas appliquée, renvoie un plan
 * `trial` indéterminé (ne plante pas).
 */
export async function GET() {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;

  try {
    const orgRes = await query<{ plan: string; trial_ends_at: string | null }>(
      `SELECT plan, trial_ends_at FROM organizations WHERE id = $1`,
      [g.user.organizationId],
    );
    const sub = await query<{
      plan: string; status: string;
      current_period_start: string | null;
      current_period_end: string | null;
      cancel_at_period_end: boolean;
    }>(
      `SELECT plan, status, current_period_start, current_period_end, cancel_at_period_end
         FROM subscriptions WHERE organization_id = $1`,
      [g.user.organizationId],
    );
    return NextResponse.json({
      organization: orgRes.rows[0],
      subscription: sub.rows[0] ?? null,
    });
  } catch (err) {
    const m = (err as Error).message ?? '';
    if (m.includes('column') || m.includes('subscriptions')) {
      return NextResponse.json({
        organization: { plan: 'trial', trial_ends_at: null },
        subscription: null,
        migration_required: '0010_multi_tenant',
      });
    }
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: m }, { status: 500 });
  }
}
