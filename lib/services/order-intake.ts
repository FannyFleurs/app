import { withTransaction } from '@/lib/db/client';
import { computeLine, computeTotals } from './money';

export interface IncomingOrderLine {
  label: string;
  amount_ttc: number;
  quantity?: number;
  /** Taux TVA % imposé par l'app commande ; sinon taux par défaut de la boutique. */
  tax_rate?: number;
  reference?: string | null;
  message_carte?: string | null;
}

export interface IncomingOrderInput {
  organizationId: string;
  storeId: string;
  /** Référence commande côté app externe : idempotence (client_ref). */
  externalRef: string;
  boutiqueLabel: string;
  lines: IncomingOrderLine[];
  client?: { name?: string | null; phone?: string | null; email?: string | null } | null;
  delivery?: {
    type?: string | null;
    date?: string | null;
    slot?: string | null;
    recipient?: string | null;
    address?: string | null;
    cp_ville?: string | null;
    notes?: string | null;
  } | null;
  comment?: string | null;
}

export interface IncomingOrderResult {
  id: string;
  status: string;
  duplicate: boolean;
}

/** 'pickup' si la commande est un retrait, 'delivery' sinon. */
function resolvePickupOrDelivery(type: string | null | undefined, hasDelivery: boolean): 'pickup' | 'delivery' {
  const t = String(type ?? '').toLowerCase();
  if (t.includes('retrait') || t.includes('pickup') || t.includes('commande')) return 'pickup';
  if (t.includes('livraison') || t.includes('delivery')) return 'delivery';
  // Sans indication : livraison s'il y a une adresse, retrait sinon.
  return hasDelivery ? 'delivery' : 'pickup';
}

/**
 * Matérialise une commande reçue de l'app externe en VENTE EN ATTENTE (on_hold)
 * de la bonne boutique, sans session de caisse (elle sera liée à l'encaissement).
 *
 * Idempotent : deux envois avec le même `externalRef` renvoient la même vente.
 * Les lignes sont des prix libres (pas de rattachement produit), avec le taux
 * de TVA par défaut de la boutique (ou le taux imposé par ligne). La commande
 * apparaît dans « En attente » ; le caissier la rappelle et l'encaisse.
 */
export async function createIncomingOrder(input: IncomingOrderInput): Promise<IncomingOrderResult> {
  return withTransaction(async (client) => {
    // 1. Idempotence : commande déjà reçue ?
    const existing = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM sales WHERE organization_id = $1 AND client_ref = $2 LIMIT 1`,
      [input.organizationId, input.externalRef],
    );
    if (existing.rows[0]) {
      return { id: existing.rows[0].id, status: existing.rows[0].status, duplicate: true };
    }

    // 2. Poste porteur (placeholder) : une caisse active de la boutique. Le poste
    //    réel + la session seront fixés au rappel/à l'encaissement.
    const reg = await client.query<{ id: string }>(
      `SELECT id FROM registers
        WHERE store_id = $1 AND organization_id = $2 AND is_active = TRUE
        ORDER BY created_at ASC LIMIT 1`,
      [input.storeId, input.organizationId],
    );
    if (!reg.rows[0]) throw new Error('NO_ACTIVE_REGISTER');

    // 3. Utilisateur porteur : le propriétaire (ou le plus ancien). L'attribution
    //    fiscale réelle se fait au caissier lors de l'encaissement.
    const usr = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE organization_id = $1
        ORDER BY (role = 'owner') DESC, created_at ASC LIMIT 1`,
      [input.organizationId],
    );
    if (!usr.rows[0]) throw new Error('NO_USER');

    // 4. Taux de TVA : table des taux de l'org (map taux -> code) + défaut boutique.
    const ratesRes = await client.query<{ code: string; rate: string; is_default: boolean }>(
      `SELECT code, rate, is_default FROM tax_rates
        WHERE organization_id = $1 AND is_active = TRUE
        ORDER BY is_default DESC, rate DESC`,
      [input.organizationId],
    );
    const rateToCode = new Map<number, string>();
    for (const r of ratesRes.rows) rateToCode.set(Number(r.rate), r.code);
    // Défaut boutique (settings 'tax:<storeId>'.default_code) sinon défaut org.
    const storeTaxRes = await client.query<{ value: { default_code?: string | null } }>(
      `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
      [input.organizationId, `tax:${input.storeId}`],
    );
    const storeDefaultCode = storeTaxRes.rows[0]?.value?.default_code ?? null;
    let defaultCode = ratesRes.rows.find((r) => r.is_default)?.code ?? ratesRes.rows[0]?.code ?? 'TVA20';
    let defaultRate = Number(ratesRes.rows.find((r) => r.is_default)?.rate ?? ratesRes.rows[0]?.rate ?? 20);
    if (storeDefaultCode) {
      const m = ratesRes.rows.find((r) => r.code === storeDefaultCode);
      if (m) { defaultCode = m.code; defaultRate = Number(m.rate); }
    }

    // 5. Lignes prix libre.
    const computed = input.lines.map((l) => {
      const rate = l.tax_rate != null ? Number(l.tax_rate) : defaultRate;
      const code = (l.tax_rate != null && rateToCode.get(rate)) || defaultCode;
      const c = computeLine({
        unitPriceTtc: Number(l.amount_ttc),
        quantity: l.quantity != null ? Number(l.quantity) : 1,
        discountAmount: 0,
        taxRate: rate,
      });
      return { ...c, code, label: l.label, reference: l.reference ?? null, message_carte: l.message_carte ?? null };
    });
    const totals = computeTotals(computed);

    // 6. Contexte livraison/retrait rangé dans delivery_info (lu par le ticket).
    const hasDelivery = !!(input.delivery?.address || input.delivery?.recipient);
    const kind = resolvePickupOrDelivery(input.delivery?.type, hasDelivery);
    const requestedAt = input.delivery?.date ? isoOrNull(input.delivery.date) : null;
    const deliveryInfo = {
      source: 'commande' as const,
      external_ref: input.externalRef,
      boutique: input.boutiqueLabel,
      pickup_or_delivery: kind,
      requested_at: requestedAt,
      slot_label: [input.delivery?.date, input.delivery?.slot].filter(Boolean).join(' · ') || null,
      recipient_name: input.delivery?.recipient ?? input.client?.name ?? null,
      recipient_phone: input.client?.phone ?? null,
      delivery_address: input.delivery?.address
        ? { line1: input.delivery.address, zip: '', city: input.delivery.cp_ville ?? '' }
        : null,
      internal_notes: input.delivery?.notes ?? input.comment ?? null,
      client: input.client ?? null,
      callback_status: 'pending' as const,
    };

    const heldLabel = buildHeldLabel(kind, input.delivery?.date, deliveryInfo.recipient_name);

    // 7. Insertion de la vente en attente + lignes.
    let saleId: string;
    try {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO sales
           (organization_id, store_id, register_id, user_id, status,
            total_ht, total_tva, total_ttc, total_discount, tva_breakdown,
            notes, held_label, client_ref, delivery_info)
         VALUES ($1,$2,$3,$4,'on_hold',$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
         RETURNING id`,
        [
          input.organizationId, input.storeId, reg.rows[0].id, usr.rows[0].id,
          totals.total_ht, totals.total_tva, totals.total_ttc, totals.total_discount,
          JSON.stringify(totals.tva_breakdown),
          input.comment ?? null, heldLabel, input.externalRef,
          JSON.stringify(deliveryInfo),
        ],
      );
      saleId = ins.rows[0]!.id;
    } catch (e) {
      // Course : le même external_ref a été inséré entre-temps (index unique).
      if ((e as { code?: string }).code === '23505') {
        const again = await client.query<{ id: string; status: string }>(
          `SELECT id, status FROM sales WHERE organization_id = $1 AND client_ref = $2 LIMIT 1`,
          [input.organizationId, input.externalRef],
        );
        if (again.rows[0]) return { id: again.rows[0].id, status: again.rows[0].status, duplicate: true };
      }
      throw e;
    }

    for (let i = 0; i < computed.length; i++) {
      const c = computed[i]!;
      await client.query(
        `INSERT INTO sale_lines
           (organization_id, sale_id, line_index, label, unit_price_ttc, quantity,
            discount_amount, tax_rate, tax_rate_code, line_ht, line_tva, line_ttc, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
        [
          input.organizationId, saleId, i, c.label, c.unit_price_ttc, c.quantity,
          c.discount_amount, c.tax_rate, c.code, c.line_ht, c.line_tva, c.line_ttc,
          JSON.stringify({
            source: 'commande',
            ...(c.reference ? { reference_article: c.reference } : {}),
            ...(c.message_carte ? { message_carte: c.message_carte } : {}),
          }),
        ],
      );
    }

    return { id: saleId, status: 'on_hold', duplicate: false };
  });
}

function isoOrNull(dateStr: string): string | null {
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function buildHeldLabel(
  kind: 'pickup' | 'delivery',
  date: string | null | undefined,
  recipient: string | null,
): string {
  const parts = [`Commande · ${kind === 'pickup' ? 'Retrait' : 'Livraison'}`];
  if (date) {
    const d = new Date(date);
    if (!Number.isNaN(d.getTime())) parts.push(d.toLocaleDateString('fr-FR'));
  }
  if (recipient) parts.push(recipient);
  return parts.join(' · ');
}
