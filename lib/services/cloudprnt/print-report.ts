import 'server-only';
import { query } from '@/lib/db/client';
import { computeDayReport } from '@/lib/services/day-report';
import { loadReceiptSettings } from '@/lib/settings/receipt-server';
import { resolveReceiptPrinter, enqueueJob } from './queue';
import { buildZReportStarPrnt, STARPRNT_CONTENT_TYPE } from './receipt-star';

/**
 * Met en file l'impression du rapport Z d'une clôture sur l'imprimante TICKET
 * CloudPRNT. `force` ignore le réglage auto_print_z (réimpression manuelle).
 * Ne jette jamais faute d'imprimante / de réglage : renvoie printed=false.
 */
export async function enqueueZReportPrint(args: {
  organizationId: string;
  userId: string;
  closureId: string;
  force?: boolean;
}): Promise<{ printed: boolean; reason?: string }> {
  const closure = await query<{
    business_date: string; store_id: string;
    cash_expected: string; cash_counted: string | null; cash_variance: string | null;
    fiscal_hash: string; sealed_at: string; closed_by_name: string;
  }>(
    `SELECT d.business_date, d.store_id,
            d.cash_expected::text, d.cash_counted::text, d.cash_variance::text,
            d.fiscal_hash, d.sealed_at, u.full_name AS closed_by_name
       FROM daily_closures d
       JOIN users u ON u.id = d.closed_by
      WHERE d.id = $1 AND d.organization_id = $2`,
    [args.closureId, args.organizationId],
  );
  if (closure.rowCount === 0) return { printed: false, reason: 'NOT_FOUND' };
  const c = closure.rows[0]!;

  const settings = await loadReceiptSettings(args.organizationId, c.store_id);
  if (!args.force && !settings.auto_print_z) return { printed: false, reason: 'DISABLED' };

  const printer = await resolveReceiptPrinter(args.organizationId, c.store_id);
  if (!printer) return { printed: false, reason: 'NO_PRINTER' };

  const report = await computeDayReport({
    organizationId: args.organizationId,
    storeId: c.store_id,
    businessDate: c.business_date,
    kind: 'Z',
    printedAt: new Date().toISOString(),
    sealed: {
      closed_by: c.closed_by_name,
      sealed_at: c.sealed_at,
      fiscal_hash: c.fiscal_hash,
      cash_counted: c.cash_counted != null ? Number(c.cash_counted) : null,
      cash_variance: c.cash_variance != null ? Number(c.cash_variance) : null,
      cash_expected: Number(c.cash_expected),
    },
  });

  const payload = await buildZReportStarPrnt(report, settings, printer.paper_width);
  await enqueueJob({
    organizationId: args.organizationId,
    printerId: printer.id,
    contentType: STARPRNT_CONTENT_TYPE,
    payload,
    title: `Rapport Z ${c.business_date}`,
    userId: args.userId,
  });
  return { printed: true };
}
