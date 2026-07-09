import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { getPlatformConfig, setSubscriptionAddonQuantity } from '@/lib/billing/stripe';

export const dynamic = 'force-dynamic';

const schema = z.object({
  // Variation du nombre de caisses supplémentaires (+1 pour ajouter, -1 pour retirer).
  delta: z.number().int().min(-20).max(20),
});

/**
 * POST /api/billing/addon/register
 * Ajuste l'option "caisse supplémentaire" (+9€/mois) : met à jour la
 * quantité de l'add-on sur l'abonnement Stripe puis le compteur local
 * subscriptions.extra_registers. Renvoie le nouveau total.
 */
export async function POST(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  const platform = await getPlatformConfig();
  if (!platform.stripe_secret_key || !platform.stripe_price_extra_register) {
    return NextResponse.json({
      error: 'ADDON_NOT_CONFIGURED',
      message: 'L\'option caisse supplémentaire n\'est pas encore configurée.',
    }, { status: 400 });
  }

  const sub = await query<{ external_ref: string | null; extra_registers: number }>(
    `SELECT external_ref, COALESCE(extra_registers, 0) AS extra_registers
       FROM subscriptions WHERE organization_id = $1`,
    [g.user.organizationId],
  );
  const s = sub.rows[0];
  if (!s?.external_ref) {
    return NextResponse.json({
      error: 'NO_SUBSCRIPTION',
      message: 'Aucun abonnement Stripe actif. Souscrivez d\'abord une offre.',
    }, { status: 400 });
  }

  const current = Number(s.extra_registers) || 0;
  const next = Math.max(0, current + parsed.data.delta);

  try {
    await setSubscriptionAddonQuantity(platform, {
      subscriptionId: s.external_ref,
      priceId: platform.stripe_price_extra_register,
      quantity: next,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[billing.addon.register]', err);
    return NextResponse.json({ error: 'STRIPE_ERROR', message: (err as Error).message }, { status: 502 });
  }

  await query(
    `UPDATE subscriptions SET extra_registers = $1, updated_at = now()
      WHERE organization_id = $2`,
    [next, g.user.organizationId],
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'billing.addon.register', entityType: 'subscription',
    payload: { from: current, to: next },
  });

  return NextResponse.json({ extra_registers: next });
}
