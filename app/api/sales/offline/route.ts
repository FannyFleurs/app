import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { SaleService } from '@/lib/services/sale-service';
import { query } from '@/lib/db/client';
import { audit } from '@/lib/audit/log';

const lineSchema = z.object({
  product_id: z.string().uuid().nullable().optional(),
  variant_id: z.string().uuid().nullable().optional(),
  label: z.string().min(1).max(300),
  unit_price_ttc: z.number(),
  quantity: z.number(),
  discount_amount: z.number().optional(),
  tax_rate: z.number(),
  tax_rate_code: z.string().max(20),
  metadata: z.record(z.unknown()).optional(),
});

const paymentSchema = z.object({
  method: z.enum(['cash','card','check','transfer','gift_card','credit_note','deferred','other']),
  amount: z.number().positive(),
  given_amount: z.number().min(0).optional(),
  reference: z.string().max(80).optional(),
});

const schema = z.object({
  client_ref: z.string().min(8).max(80),         // idempotence (UUID poste)
  occurred_at: z.string().datetime(),            // heure réelle de l'encaissement
  store_id: z.string().uuid(),
  register_id: z.string().uuid(),
  customer_id: z.string().uuid().nullable().optional(),
  lines: z.array(lineSchema).min(1),
  payments: z.array(paymentSchema).min(1),
  loyalty_redemption_amount: z.number().min(0).optional(),
});

/**
 * Scellement d'une vente encaissée HORS-LIGNE, rejouée à la reprise réseau.
 * Idempotent (client_ref) : rejouer plusieurs fois ne crée jamais de doublon.
 * Réutilise EXACTEMENT le même scellement fiscal que l'encaissement en ligne
 * (createDraft → setLines → validate) : la chaîne fiscale reste valide.
 */
export async function POST(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;
  const org = g.user.organizationId;

  // 1) Idempotence : déjà scellée ?
  const existing = await existingReceipt(org, d.client_ref);
  if (existing) {
    return NextResponse.json({ ...existing, duplicate: true });
  }

  // 2) La boutique/caisse appartiennent bien à l'org ?
  const own = await query(
    `SELECT 1 FROM registers WHERE id = $1 AND store_id = $2 AND organization_id = $3`,
    [d.register_id, d.store_id, org],
  );
  if (own.rowCount === 0) return jsonError('REGISTER_NOT_FOUND', 404);

  try {
    // 3) Brouillon (avec idempotence + heure réelle) → lignes → scellement.
    const draft = await SaleService.createDraft({
      organizationId: org,
      storeId: d.store_id,
      registerId: d.register_id,
      userId: g.user.id,
      customerId: d.customer_id ?? null,
      clientRef: d.client_ref,
      occurredAt: d.occurred_at,
    });
    await SaleService.setLines(draft.id, org, d.lines);
    const out = await SaleService.validate({
      saleId: draft.id,
      organizationId: org,
      userId: g.user.id,
      payments: d.payments,
      loyaltyRedemptionAmount: d.loyalty_redemption_amount,
    });

    await audit({
      organizationId: org, userId: g.user.id,
      action: 'sales.validate.offline',
      entityType: 'sale', entityId: out.saleId,
      payload: { receipt_number: out.receiptNumber, client_ref: d.client_ref, occurred_at: d.occurred_at },
    });

    return NextResponse.json({
      sale_id: out.saleId,
      receipt_id: out.receiptId,
      receipt_number: out.receiptNumber,
      loyalty: out.loyalty ?? null,
      duplicate: false,
    });
  } catch (err) {
    const msg = (err as Error).message ?? '';
    // Course concurrente : le client_ref a été inséré entre-temps -> on
    // renvoie la vente déjà scellée (idempotence).
    if (/duplicate key|sales_org_client_ref_uk|unique/i.test(msg)) {
      const again = await existingReceipt(org, d.client_ref);
      if (again) return NextResponse.json({ ...again, duplicate: true });
    }
    if (msg === 'NO_OPEN_CASH_SESSION') {
      return jsonError('NO_OPEN_CASH_SESSION', 409, {
        message: 'La journée de caisse est fermée : rouvrez-la pour synchroniser les ventes hors-ligne.',
      });
    }
    // eslint-disable-next-line no-console
    console.error('[sales.offline]', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: msg }, { status: 500 });
  }
}

async function existingReceipt(
  org: string, clientRef: string,
): Promise<{ sale_id: string; receipt_number: string | null } | null> {
  try {
    const r = await query<{ id: string; receipt_number: string | null; status: string }>(
      `SELECT id, receipt_number, status FROM sales
        WHERE organization_id = $1 AND client_ref = $2 LIMIT 1`,
      [org, clientRef],
    );
    const row = r.rows[0];
    if (row && row.status === 'validated') {
      return { sale_id: row.id, receipt_number: row.receipt_number };
    }
  } catch { /* colonne client_ref absente (pré-0037) */ }
  return null;
}
