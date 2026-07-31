import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guards';
import { runMonthlyBillingForOrg } from '@/lib/services/monthly-billing';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Déclenchement MANUEL de la facturation mensuelle pour l'organisation
 * courante (bouton « Générer les factures mensuelles »). Même traitement que
 * le cron, mais tracé au nom de l'utilisateur connecté.
 */
export async function POST() {
  const g = await requirePermission('invoices.create');
  if ('response' in g) return g.response;

  const result = await runMonthlyBillingForOrg(g.user.organizationId, g.user.id);

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'billing.monthly_run', entityType: 'invoice', entityId: null,
    payload: { generated: result.generated.length, skipped: result.skipped.length },
  });

  return NextResponse.json(result);
}
