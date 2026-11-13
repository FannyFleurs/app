import 'server-only';
import { query } from '@/lib/db/client';
import { computeDayReport, type DayReport } from '@/lib/services/day-report';
import { loadReceiptSettings } from '@/lib/settings/receipt-server';
import { CASH_KEY, mergeCashDefaults, type CashSettings } from '@/lib/settings/cash';
import { loadScopedSettingValue } from '@/lib/settings/scoped-server';
import { resolveReceiptPrinter, enqueueJob } from './queue';
import { buildZReportStarPrnt, buildAutoWithdrawalStarPrnt, STARPRNT_CONTENT_TYPE } from './receipt-star';

interface ClosureRow {
  business_date: string; store_id: string;
  cash_expected: string; cash_counted: string | null; cash_variance: string | null;
  fiscal_hash: string; sealed_at: string; closed_by_name: string;
}

/** Charge la clôture et reconstruit le DayReport (Z) qu'elle a scellé — base
 *  commune au ticket Z et au ticket de prélèvement automatique, pour garantir
 *  des chiffres identiques des deux côtés. */
async function loadClosureAndReport(
  organizationId: string, closureId: string,
): Promise<{ closure: ClosureRow; report: DayReport } | null> {
  const closure = await query<ClosureRow>(
    `SELECT d.business_date, d.store_id,
            d.cash_expected::text, d.cash_counted::text, d.cash_variance::text,
            d.fiscal_hash, d.sealed_at, u.full_name AS closed_by_name
       FROM daily_closures d
       JOIN users u ON u.id = d.closed_by
      WHERE d.id = $1 AND d.organization_id = $2`,
    [closureId, organizationId],
  );
  if (closure.rowCount === 0) return null;
  const c = closure.rows[0]!;

  const report = await computeDayReport({
    organizationId,
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
  return { closure: c, report };
}

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
  const loaded = await loadClosureAndReport(args.organizationId, args.closureId);
  if (!loaded) return { printed: false, reason: 'NOT_FOUND' };
  const { closure: c, report } = loaded;

  const settings = await loadReceiptSettings(args.organizationId, c.store_id);
  if (!args.force && !settings.auto_print_z) return { printed: false, reason: 'DISABLED' };

  const printer = await resolveReceiptPrinter(args.organizationId, c.store_id);
  if (!printer) return { printed: false, reason: 'NO_PRINTER' };

  const payload = await buildZReportStarPrnt(report, settings, printer.paper_width, printer.print_width_dots);
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

/**
 * Met en file l'impression du ticket de prélèvement AUTOMATIQUE d'une
 * clôture — uniquement quand le fond de caisse est fixe et qu'aucune remise
 * n'a été réellement enregistrée ce jour (voir DayReport.cash.remise_banque
 * / remise_banque_recorded), que le réglage est activé (Gestion argent), et
 * que le Z ne s'imprime pas déjà automatiquement (il montre déjà ce
 * surplus). `force` ignore uniquement ces deux derniers réglages — pas
 * l'éligibilité (rien à prélever reste rien à prélever).
 */
export async function enqueueAutoWithdrawalPrint(args: {
  organizationId: string;
  userId: string;
  closureId: string;
  force?: boolean;
}): Promise<{ printed: boolean; reason?: string }> {
  const loaded = await loadClosureAndReport(args.organizationId, args.closureId);
  if (!loaded) return { printed: false, reason: 'NOT_FOUND' };
  const { closure: c, report } = loaded;

  const eligible = report.cash.remise_banque > 0 && !report.cash.remise_banque_recorded;
  if (!eligible) return { printed: false, reason: 'NOT_APPLICABLE' };

  const receiptSettings = await loadReceiptSettings(args.organizationId, c.store_id);
  if (!args.force) {
    const cashValue = await loadScopedSettingValue<CashSettings>(args.organizationId, CASH_KEY, c.store_id);
    const cash = mergeCashDefaults(cashValue);
    if (!cash.print_auto_withdrawal_receipt) return { printed: false, reason: 'DISABLED' };
    if (receiptSettings.auto_print_z) return { printed: false, reason: 'Z_AUTO_PRINT_ON' };
  }

  const printer = await resolveReceiptPrinter(args.organizationId, c.store_id);
  if (!printer) return { printed: false, reason: 'NO_PRINTER' };

  const payload = await buildAutoWithdrawalStarPrnt({
    closure_id: args.closureId,
    store_name: report.store_name,
    closed_by: report.closed_by,
    closed_at: report.closed_at,
    cash_before: Number((report.cash.total_espece_fermeture + report.cash.remise_banque).toFixed(2)),
    target_float: report.cash.fonds_de_caisse,
    amount: report.cash.remise_banque,
    org_name: report.identity.name,
  }, receiptSettings, printer.paper_width, printer.print_width_dots);
  await enqueueJob({
    organizationId: args.organizationId,
    printerId: printer.id,
    contentType: STARPRNT_CONTENT_TYPE,
    payload,
    title: `Prelevement automatique ${c.business_date}`,
    userId: args.userId,
  });
  return { printed: true };
}
