import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { runMonthlyBillingForOrg, resolveBillingActor } from '@/lib/services/monthly-billing';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Cron mensuel (Vercel) : génère les factures de période des clients marqués
 * « facturation mensuelle », pour TOUTES les organisations.
 *
 * Sécurité : si CRON_SECRET est défini, on exige l'en-tête
 * `Authorization: Bearer <CRON_SECRET>` (ajouté automatiquement par Vercel Cron
 * lorsque la variable est configurée). À défaut, on n'accepte que les appels
 * portant l'en-tête `x-vercel-cron`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const isVercelCron = req.headers.get('x-vercel-cron') != null;
  if (secret) {
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }
  } else if (!isVercelCron) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const orgs = await query<{ organization_id: string }>(
    `SELECT DISTINCT organization_id FROM customers
      WHERE billing_frequency = 'monthly' AND is_anonymized = FALSE`,
  );

  const runs = [];
  let totalGenerated = 0;
  for (const o of orgs.rows) {
    const actor = await resolveBillingActor(o.organization_id);
    if (!actor) {
      runs.push({ organization_id: o.organization_id, error: 'NO_ACTOR' });
      continue;
    }
    const res = await runMonthlyBillingForOrg(o.organization_id, actor);
    totalGenerated += res.generated.length;
    runs.push(res);
  }

  return NextResponse.json({ ok: true, organizations: orgs.rows.length, invoices_generated: totalGenerated, runs });
}
