import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { ClosingService } from '@/lib/services/closing-service';
import { audit } from '@/lib/audit/log';
import { query } from '@/lib/db/client';
import { enqueueZReportPrint, enqueueAutoWithdrawalPrint } from '@/lib/services/cloudprnt/print-report';

const schema = z.object({
  store_id: z.string().uuid(),
  business_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  counted_cash: z.number().min(0).optional(),
  declared_payments: z.record(z.number().min(0)).optional(),
  denomination_count: z.record(z.number().int().min(0)).optional(),
  notes: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  const g = await requirePermission('closures.daily');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  try {
    const out = await ClosingService.sealDaily({
      organizationId: g.user.organizationId,
      storeId: parsed.data.store_id,
      userId: g.user.id,
      businessDate: parsed.data.business_date,
      countedCash: parsed.data.counted_cash,
      declaredPayments: parsed.data.declared_payments,
      denominationCount: parsed.data.denomination_count,
      notes: parsed.data.notes,
    });
    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'closures.daily.sealed',
      entityType: 'closure_daily', entityId: out.daily_closure_id,
      payload: { business_date: parsed.data.business_date, totals: out.totals },
    });

    // Impression auto du Z sur l'imprimante ticket (si activé + imprimante
    // configurée). AWAIT + try/catch : ne bloque jamais la clôture déjà scellée.
    let zPrinted = false;
    try {
      const r = await enqueueZReportPrint({
        organizationId: g.user.organizationId,
        userId: g.user.id,
        closureId: out.daily_closure_id,
      });
      zPrinted = r.printed;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[closure.z_print]', err);
    }

    // Idem pour le ticket de prélèvement automatique (voir CashSettings
    // .print_auto_withdrawal_receipt). NO_PRINTER (pas de CloudPRNT) est
    // signalé au client : il tente alors le repli PDF + impression navigateur,
    // comme pour le Z (ClosuresAdmin.tsx).
    let withdrawalPrinted = false;
    let withdrawalNeedsFallback = false;
    try {
      const r = await enqueueAutoWithdrawalPrint({
        organizationId: g.user.organizationId,
        userId: g.user.id,
        closureId: out.daily_closure_id,
      });
      withdrawalPrinted = r.printed;
      withdrawalNeedsFallback = !r.printed && r.reason === 'NO_PRINTER';
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[closure.withdrawal_print]', err);
    }

    return NextResponse.json({
      ...out, z_printed: zPrinted,
      withdrawal_printed: withdrawalPrinted, withdrawal_needs_fallback: withdrawalNeedsFallback,
    }, { status: 201 });
  } catch (e) {
    const msg = (e as Error).message;
    const status =
      msg === 'DAILY_CLOSURE_ALREADY_SEALED' ? 409 :
      msg === 'NOTHING_TO_SEAL' ? 422 : 400;
    return jsonError(msg, status);
  }
}

export async function GET(req: Request) {
  const g = await requirePermission('closures.daily');
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  const storeId = url.searchParams.get('store_id');
  if (!storeId) return jsonError('store_id requis', 400);
  const { rows } = await query(
    `SELECT id, business_date, total_sales, total_ttc, total_ht, total_tva,
            cash_expected, cash_counted, cash_variance, sealed_at, fiscal_hash
       FROM daily_closures
      WHERE organization_id = $1 AND store_id = $2
      ORDER BY business_date DESC LIMIT 60`,
    [g.user.organizationId, storeId],
  );
  return NextResponse.json({ closures: rows });
}
