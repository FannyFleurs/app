import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { mergePlatformDefaults, type PlatformSettings } from '@/lib/settings/platform';

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
      extra_registers: number | null;
    }>(
      `SELECT plan, status, current_period_start, current_period_end,
              cancel_at_period_end, COALESCE(extra_registers, 0) AS extra_registers
         FROM subscriptions WHERE organization_id = $1`,
      [g.user.organizationId],
    );

    // Option caisse supplémentaire : prix affiché + disponibilité.
    let addon: PlatformSettings = mergePlatformDefaults(null);
    try {
      const pr = await query<{ value: Partial<PlatformSettings> }>(
        `SELECT value FROM platform_settings WHERE id = 1`,
      );
      addon = mergePlatformDefaults(pr.rows[0]?.value ?? null);
    } catch { /* défauts */ }
    const plan = sub.rows[0]?.plan ?? orgRes.rows[0]?.plan ?? 'trial';

    return NextResponse.json({
      organization: orgRes.rows[0],
      subscription: sub.rows[0] ?? null,
      extra_registers: Number(sub.rows[0]?.extra_registers ?? 0) || 0,
      addon_register_price: addon.addon_register_price,
      addon_register_available:
        plan === 'starter' && !!addon.stripe_secret_key && !!addon.stripe_price_extra_register,
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
