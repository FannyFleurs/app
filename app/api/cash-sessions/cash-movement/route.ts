import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { loadScopedSettingValue } from '@/lib/settings/scoped-server';
import { CASH_KEY, mergeCashDefaults, type CashSettings } from '@/lib/settings/cash';
import { isSharedFloat } from '@/lib/settings/cash-server';
import { CashSessionService } from '@/lib/services/cash-session-service';
import { loadReceiptSettings } from '@/lib/settings/receipt-server';
import { resolveReceiptPrinter, enqueueJob } from '@/lib/services/cloudprnt/queue';
import { buildBankDepositStarPrnt, STARPRNT_CONTENT_TYPE } from '@/lib/services/cloudprnt/receipt-star';
import { isDepositReason, DEPOSIT_LABEL } from '@/lib/services/cash-deposit';

const schema = z.object({
  register_id: z.string().uuid(),
  movement_type: z.enum(['in', 'out']),
  amount: z.number().positive(),
  reason: z.string().min(1).max(200),
});

/**
 * Mouvement de caisse (entrée ou sortie d'espèces hors vente).
 * Cas typiques : remise en banque (out), fond de réserve apporté (in),
 * paiement fournisseur en espèces (out), etc.
 *
 * Écrit dans cash_movements (append-only), associé à la session ouverte.
 */
export async function POST(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { register_id, movement_type, amount, reason } = parsed.data;

  // Boutique du poste : le fonds commun vit au niveau boutique, donc le
  // mouvement d'espèces s'attache à la session de la BOUTIQUE quand le poste a
  // rejoint le fonds d'un autre poste (sinon « NO_OPEN_SESSION » à tort).
  const regRow = await query<{ store_id: string }>(
    `SELECT store_id FROM registers WHERE id = $1 AND organization_id = $2`,
    [register_id, g.user.organizationId],
  );
  if (regRow.rowCount === 0) return jsonError('REGISTER_NOT_FOUND', 404);
  const storeId = regRow.rows[0]!.store_id;
  const shared = await isSharedFloat(g.user.organizationId, storeId);
  const sessionId = await CashSessionService.resolveOpenSessionId({
    storeId, registerId: register_id, shared,
  });
  if (!sessionId) return jsonError('NO_OPEN_SESSION', 400);
  const s = { id: sessionId, store_id: storeId };

  const ins = await query<{ id: string }>(
    `INSERT INTO cash_movements
       (organization_id, cash_session_id, movement_type, amount, reason, user_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [g.user.organizationId, s.id, movement_type, amount, reason, g.user.id],
  );

  await audit({
    organizationId: g.user.organizationId,
    userId: g.user.id,
    action: `cash_movement.${movement_type}`,
    entityType: 'cash_session',
    entityId: s.id,
    payload: { amount, reason, register_id },
  });

  // Impression du reçu de remise en banque sur l'imprimante ticket (si le
  // réglage « Imprimer un reçu à chaque remise en banque » est coché et qu'une
  // imprimante est configurée). AWAIT + try/catch : ne bloque pas l'opération.
  let receiptPrinted = false;
  const isBankDeposit = movement_type === 'out' && isDepositReason(reason);
  if (isBankDeposit) {
    try {
      const cash = mergeCashDefaults(
        await loadScopedSettingValue<CashSettings>(g.user.organizationId, CASH_KEY, s.store_id),
      );
      if (cash.print_bank_deposit_receipt) {
        const printer = await resolveReceiptPrinter(g.user.organizationId, s.store_id);
        if (printer) {
          const ctx = await query<{
            store_name: string; register_code: string; org_name: string; user_name: string;
          }>(
            `SELECT st.name AS store_name, rg.code AS register_code,
                    o.name AS org_name, u.full_name AS user_name
               FROM stores st, registers rg, organizations o, users u
              WHERE st.id = $1 AND rg.id = $2 AND o.id = $3 AND u.id = $4`,
            [s.store_id, register_id, g.user.organizationId, g.user.id],
          );
          const cc = ctx.rows[0];
          if (cc) {
            const rs = await loadReceiptSettings(g.user.organizationId, s.store_id);
            const payload = await buildBankDepositStarPrnt(
              {
                id: ins.rows[0]!.id, movement_type, amount, reason,
                created_at: new Date().toISOString(),
                user_name: cc.user_name, store_name: cc.store_name,
                register_code: cc.register_code, org_name: cc.org_name,
              },
              rs, printer.paper_width,
            );
            await enqueueJob({
              organizationId: g.user.organizationId, printerId: printer.id,
              contentType: STARPRNT_CONTENT_TYPE, payload,
              title: DEPOSIT_LABEL, userId: g.user.id,
            });
            receiptPrinted = true;
          }
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[cash_movement.deposit_print]', err);
    }
  }

  return NextResponse.json({ ok: true, id: ins.rows[0]!.id, receipt_printed: receiptPrinted });
}

/**
 * Liste les mouvements d'une session ouverte pour la caisse donnée
 * (ou de la session passée par session_id).
 */
export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  const registerId = url.searchParams.get('register_id');
  const sessionIdParam = url.searchParams.get('session_id');

  let sessionId = sessionIdParam;
  if (!sessionId && registerId) {
    // Même résolution qu'à l'écriture : en fonds commun, les mouvements se
    // lisent sur la session de la BOUTIQUE, pas seulement celle du poste.
    const regRow = await query<{ store_id: string }>(
      `SELECT store_id FROM registers WHERE id = $1 AND organization_id = $2`,
      [registerId, g.user.organizationId],
    );
    const storeId = regRow.rows[0]?.store_id ?? null;
    if (storeId) {
      const shared = await isSharedFloat(g.user.organizationId, storeId);
      sessionId = await CashSessionService.resolveOpenSessionId({
        storeId, registerId, shared,
      });
    }
  }
  if (!sessionId) return NextResponse.json({ movements: [] });

  const { rows } = await query(
    `SELECT id, movement_type, amount::text, reason, created_at
       FROM cash_movements
      WHERE cash_session_id = $1 AND organization_id = $2
      ORDER BY created_at DESC LIMIT 200`,
    [sessionId, g.user.organizationId],
  );
  return NextResponse.json({ movements: rows });
}
