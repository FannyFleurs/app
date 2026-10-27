import { withTransaction } from '@/lib/db/client';
import { computeLine, computeTotals, round2 } from './money';
import { loadOrderAutoCheckout } from '@/lib/settings/order-auto-checkout-server';
import { paymentMethodFieldForSource } from '@/lib/settings/order-auto-checkout';
import { ensureVirtualRegisterSession } from './virtual-register';
import { validateSaleAndNotify } from './sale-validate-and-notify';
import type { SalePaymentInput } from './sale-service';
import { audit } from '@/lib/audit/log';

export interface IncomingOrderLine {
  label: string;
  amount_ttc: number;
  quantity?: number;
  /**
   * Taux TVA % imposé par l'app commande. Sinon : le taux par défaut DE LA
   * CATÉGORIE résolue pour la ligne, s'il en a un configuré (fiche
   * catégorie — ex. "Livraison" à 20 % même dans une boutique à 10 %) ;
   * sinon le taux par défaut de la boutique.
   */
  tax_rate?: number;
  reference?: string | null;
  message_carte?: string | null;
  /**
   * Nom EXACT d'une catégorie HelloPos existante (ex. "Fleurs coupées"),
   * tel que renseigné sur la fiche produit côté site/OGF. Recherché sans
   * tenir compte de la casse ni des espaces. Optionnel : si absent (ou sans
   * correspondance), on retente avec le LIBELLÉ de la ligne lui-même — utile
   * pour un libellé constant d'une commande à l'autre (ex. "Livraison") qui
   * n'a pas besoin d'être explicitement catégorisé à chaque fois une fois la
   * catégorie du même nom créée. Sans aucune correspondance, la ligne
   * retombe sur la catégorie "Divers" de l'organisation — voir
   * resolveCategoryId ci-dessous.
   */
  category?: string | null;
}

export interface IncomingOrderInput {
  organizationId: string;
  storeId: string;
  /** Référence commande côté app externe : idempotence (client_ref). */
  externalRef: string;
  boutiqueLabel: string;
  /** Sous-type commande (ex. "ogf") : sert au rattachement du compte client. */
  subtype?: string | null;
  /** Canal d'origine : "OGF", "WEB", ou null. Affiché en tag dans « En attente ». */
  source?: string | null;
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
 * Les lignes sont des prix libres (pas de rattachement produit). Chaque ligne
 * reçoit une catégorie, résolue par nom ou par libellé (ou "Divers" à défaut
 * — voir resolveCategoryId), pour que les exports qui ventilent par famille
 * restent complets ; et un taux de TVA résolu par priorité : imposé par la
 * ligne, sinon défaut de cette catégorie si elle en a un, sinon défaut
 * boutique. La commande apparaît dans « En attente » ; le caissier la rappelle
 * et l'encaisse.
 */
export async function createIncomingOrder(input: IncomingOrderInput): Promise<IncomingOrderResult> {
  const orderSource = normalizeSource(input.source);

  const created = await withTransaction(async (client) => {
    // 1. Idempotence : commande déjà reçue ?
    const existing = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM sales WHERE organization_id = $1 AND client_ref = $2 LIMIT 1`,
      [input.organizationId, input.externalRef],
    );
    if (existing.rows[0]) {
      return { duplicate: true as const, id: existing.rows[0].id, status: existing.rows[0].status };
    }

    // 2. Utilisateur porteur (avant le choix du poste : nécessaire pour
    //    ouvrir la session de la caisse virtuelle le cas échéant). Le
    //    propriétaire (ou le plus ancien). L'attribution fiscale réelle se
    //    fait au caissier lors de l'encaissement — sauf encaissement
    //    automatique ci-dessous, où elle reste ce même "utilisateur porteur".
    const usr = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE organization_id = $1
        ORDER BY (role = 'owner') DESC, created_at ASC LIMIT 1`,
      [input.organizationId],
    );
    if (!usr.rows[0]) throw new Error('NO_USER');

    // Encaissement automatique (WEB/OGF) : réglage actif pour cette boutique
    // ET un mode de règlement par défaut configuré pour CETTE source — voir
    // Paramètres → Modes de règlement. Sinon, comportement inchangé (vente
    // en attente, poste réel choisi au rappel).
    let autoPaymentMethod: { id: string; kind: string; label: string } | null = null;
    if (orderSource) {
      const autoSettings = await loadOrderAutoCheckout(input.organizationId, input.storeId);
      const pmId = autoSettings.enabled ? autoSettings[paymentMethodFieldForSource(orderSource)] : null;
      if (pmId) {
        const pm = await client.query<{ id: string; kind: string; label: string }>(
          `SELECT id, kind, label FROM payment_methods
            WHERE id = $1 AND organization_id = $2 AND is_active = TRUE`,
          [pmId, input.organizationId],
        );
        autoPaymentMethod = pm.rows[0] ?? null;
      }
    }

    // 3. Poste porteur. Encaissement automatique : la caisse VIRTUELLE
    //    (toujours ouverte, voir virtual-register.ts) — la vente est scellée
    //    plus bas, pas besoin d'un poste physique actif. Sinon (comportement
    //    inchangé) : un placeholder (une caisse active de la boutique), le
    //    poste réel + la session étant fixés au rappel/à l'encaissement.
    let registerId: string;
    let virtualSessionId: string | null = null;
    if (autoPaymentMethod) {
      const vr = await ensureVirtualRegisterSession(input.organizationId, input.storeId, usr.rows[0].id, client);
      registerId = vr.registerId;
      virtualSessionId = vr.sessionId;
    } else {
      const reg = await client.query<{ id: string }>(
        `SELECT id FROM registers
          WHERE store_id = $1 AND organization_id = $2 AND is_active = TRUE AND is_virtual = FALSE
          ORDER BY created_at ASC LIMIT 1`,
        [input.storeId, input.organizationId],
      );
      if (!reg.rows[0]) throw new Error('NO_ACTIVE_REGISTER');
      registerId = reg.rows[0].id;
    }

    // Compte client imposé pour les commandes OGF.
    let customerId: string | null = null;
    // Remise systématique de ce client (fiche client, ex. OGF Services
    // Financiers à -20 %) — voir son application plus bas (étape 6) : même
    // règle que CashRegister.tsx/pickCustomer (remise % du prix ligne).
    let customerDiscountPct: number | null = null;

    if (String(input.subtype || '').toLowerCase() === 'ogf') {
      const customerRes = await client.query<{ id: string; default_discount_pct: string | null }>(
        `SELECT id, default_discount_pct
           FROM customers
          WHERE organization_id = $1
            AND LOWER(TRIM(company_name)) = LOWER(TRIM($2))
            AND is_anonymized = FALSE
            AND archived_at IS NULL
          LIMIT 1`,
        [input.organizationId, 'OGF Services Financiers'],
      );

      customerId = customerRes.rows[0]?.id ?? null;
      const pct = customerRes.rows[0]?.default_discount_pct;
      customerDiscountPct = pct != null && Number(pct) > 0 ? Number(pct) : null;
    }

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

    // 5. Catégorie par ligne : nom envoyé par la source -> catégorie existante
    //    de l'organisation (insensible à la casse/aux espaces). À défaut, on
    //    essaie le LIBELLÉ de la ligne lui-même — un libellé toujours identique
    //    d'une commande à l'autre (ex. "Livraison") correspond logiquement à
    //    une catégorie du même nom une fois qu'elle existe, sans que la
    //    source ait besoin de l'envoyer explicitement à chaque fois. Sans
    //    aucune correspondance, on retombe sur "Divers" (créée au besoin) :
    //    les exports qui ventilent par famille restent complets même si la
    //    source envoie un nom pas encore déclaré côté HelloPos, plutôt que de
    //    laisser la ligne sans aucune catégorie.
    const catsRes = await client.query<{
      id: string; name: string; default_tax_rate: string | null; default_tax_code: string | null;
    }>(
      `SELECT c.id, c.name, tr.rate::text AS default_tax_rate, tr.code AS default_tax_code
         FROM product_categories c
         LEFT JOIN tax_rates tr ON tr.id = c.default_tax_rate_id
        WHERE c.organization_id = $1`,
      [input.organizationId],
    );
    const categoryByName = new Map<string, string>();
    // Taux de TVA par défaut DE LA CATÉGORIE (fiche catégorie, migration 0078)
    // — ex. "Livraison" à 20 % alors que la boutique vend des fleurs à 10 %.
    // Utilisé seulement si la ligne n'impose pas déjà son propre taux.
    const categoryDefaultTax = new Map<string, { rate: number; code: string }>();
    for (const r of catsRes.rows) {
      categoryByName.set(r.name.trim().toLowerCase(), r.id);
      if (r.default_tax_rate != null && r.default_tax_code != null) {
        categoryDefaultTax.set(r.id, { rate: Number(r.default_tax_rate), code: r.default_tax_code });
      }
    }
    const isOgf = String(input.subtype || '').toLowerCase() === 'ogf';
    let fallbackCategoryId: string | null = null;
    async function resolveCategoryId(name: string | null | undefined, label: string): Promise<string | null> {
      for (const candidate of [name, label]) {
        const key = (candidate ?? '').trim().toLowerCase();
        if (key && categoryByName.has(key)) return categoryByName.get(key)!;
      }
      // Commandes OGF (client funéraire) : un article de SON catalogue, sans
      // correspondance exacte (ex. composition "personnalisée", sans nom de
      // catégorie envoyé), est toujours lié au deuil — "Deuil" est un
      // meilleur filet que "Divers" si cette catégorie existe déjà dans
      // l'organisation. Si elle n'existe pas, on ne la crée pas d'office
      // (contrairement à "Divers") : ce n'est pas à nous de décider qu'une
      // organisation qui n'a jamais créé "Deuil" doit en avoir une.
      if (isOgf && categoryByName.has('deuil')) return categoryByName.get('deuil')!;
      if (!fallbackCategoryId) {
        const existing = await client.query<{ id: string }>(
          `SELECT id FROM product_categories WHERE organization_id = $1 AND LOWER(TRIM(name)) = 'divers' LIMIT 1`,
          [input.organizationId],
        );
        fallbackCategoryId = existing.rows[0]?.id ?? (
          await client.query<{ id: string }>(
            `INSERT INTO product_categories (organization_id, name) VALUES ($1, 'Divers') RETURNING id`,
            [input.organizationId],
          )
        ).rows[0]!.id;
      }
      return fallbackCategoryId;
    }
    // Séquentiel (pas Promise.all) : la création paresseuse de "Divers" ne
    // doit pas se produire deux fois en parallèle sur la même transaction.
    const categoryIds: (string | null)[] = [];
    for (const l of input.lines) categoryIds.push(await resolveCategoryId(l.category, l.label));

    // 6. Lignes prix libre. Taux de TVA : celui imposé par la ligne en
    //    priorité, sinon le défaut DE LA CATÉGORIE résolue si elle en a un,
    //    sinon le défaut boutique/organisation.
    const computed = input.lines.map((l, i) => {
      const categoryTax = categoryDefaultTax.get(categoryIds[i] ?? '');
      const rate = l.tax_rate != null ? Number(l.tax_rate) : (categoryTax?.rate ?? defaultRate);
      const code = l.tax_rate != null
        ? (rateToCode.get(rate) || defaultCode)
        : (categoryTax?.code ?? defaultCode);
      const unitPriceTtc = Number(l.amount_ttc);
      const quantity = l.quantity != null ? Number(l.quantity) : 1;
      // Remise systématique du client (ex. OGF Services Financiers à -20 %),
      // même formule que CashRegister.tsx/pickCustomer.
      const discountAmount = customerDiscountPct
        ? round2((unitPriceTtc * quantity * customerDiscountPct) / 100)
        : 0;
      const c = computeLine({
        unitPriceTtc,
        quantity,
        discountAmount,
        taxRate: rate,
      });
      return {
        ...c, code, label: l.label, reference: l.reference ?? null,
        message_carte: l.message_carte ?? null, category_id: categoryIds[i] ?? null,
      };
    });
    const totals = computeTotals(computed);

    // 7. Contexte livraison/retrait rangé dans delivery_info (lu par le ticket).
    const hasDelivery = !!(input.delivery?.address || input.delivery?.recipient);
    const kind = resolvePickupOrDelivery(input.delivery?.type, hasDelivery);
    const requestedAt = input.delivery?.date ? isoOrNull(input.delivery.date) : null;
    const deliveryInfo = {
      source: 'commande' as const,
      // Canal d'origine (OGF / WEB / null) : clé distincte de `source` (qui
      // marque « commande entrante ») pour ne pas casser la détection en caisse.
      order_source: orderSource,
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

    // 8. Insertion de la vente en attente + lignes.
    let saleId: string;
    try {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO sales
   (organization_id, store_id, register_id, cash_session_id, user_id, customer_id, status,
    total_ht, total_tva, total_ttc, total_discount, tva_breakdown,
    notes, held_label, client_ref, delivery_info)
 VALUES ($1,$2,$3,$4,$5,$6,'on_hold',$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
 RETURNING id`,
        [
  input.organizationId, input.storeId, registerId, virtualSessionId, usr.rows[0].id,
  customerId,
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
        if (again.rows[0]) return { duplicate: true as const, id: again.rows[0].id, status: again.rows[0].status };
      }
      throw e;
    }

    for (let i = 0; i < computed.length; i++) {
      const c = computed[i]!;
      await client.query(
        `INSERT INTO sale_lines
           (organization_id, sale_id, line_index, label, unit_price_ttc, quantity,
            discount_amount, tax_rate, tax_rate_code, line_ht, line_tva, line_ttc, metadata,
            category_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)`,
        [
          input.organizationId, saleId, i, c.label, c.unit_price_ttc, c.quantity,
          c.discount_amount, c.tax_rate, c.code, c.line_ht, c.line_tva, c.line_ttc,
          JSON.stringify({
            source: 'commande',
            ...(c.reference ? { reference_article: c.reference } : {}),
            ...(c.message_carte ? { message_carte: c.message_carte } : {}),
            // Tague la remise comme "automatique client" (et non manuelle)
            // pour les rapports de remises — même convention que
            // CashRegister.tsx/pickCustomer.
            ...(customerDiscountPct ? { auto_discount_pct: customerDiscountPct } : {}),
          }),
          c.category_id,
        ],
      );
    }

    return {
      duplicate: false as const, id: saleId,
      autoPaymentMethod, totalTtc: totals.total_ttc, userId: usr.rows[0].id,
    };
  });

  if (created.duplicate) {
    return { id: created.id, status: created.status, duplicate: true };
  }

  // Encaissement automatique : hors transaction (la vente doit être commitée
  // avant que SaleService.validate() ne la verrouille/la lise). Best-effort —
  // un échec (ex. mode de règlement désactivé entre-temps) laisse la vente
  // "en attente", comportement normal : jamais fatal à la réception de la
  // commande, déjà enregistrée avec succès.
  if (created.autoPaymentMethod) {
    try {
      await validateSaleAndNotify({
        saleId: created.id,
        organizationId: input.organizationId,
        userId: created.userId,
        payments: [{
          method: created.autoPaymentMethod.kind as SalePaymentInput['method'],
          amount: created.totalTtc,
          label: created.autoPaymentMethod.label,
        }],
        skipDrawerKick: true,
      });
      return { id: created.id, status: 'validated', duplicate: false };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[order_intake.auto_checkout]', err);
      // La vente EXISTE (déjà commitée, visible dans « En attente ») mais
      // reste on_hold au lieu de l'encaissement automatique attendu — sans
      // ce journal, c'est invisible ailleurs qu'ici : voir /commandes-rejetees.
      try {
        await audit({
          organizationId: input.organizationId,
          userId: null,
          action: 'order_intake.auto_checkout_failed',
          entityType: 'sale',
          entityId: created.id,
          payload: {
            reason: (err as Error).message || 'AUTO_CHECKOUT_ERROR',
            boutique: input.boutiqueLabel,
            external_ref: input.externalRef,
            source: orderSource,
            store_id: input.storeId,
          },
          severity: 'error',
        });
      } catch { /* jamais fatal à la réception de la commande */ }
    }
  }

  return { id: created.id, status: 'on_hold', duplicate: false };
}

/** Canal normalisé : on ne retient que "OGF" ou "WEB", sinon null. */
function normalizeSource(source: string | null | undefined): 'OGF' | 'WEB' | null {
  const s = String(source ?? '').trim().toUpperCase();
  return s === 'OGF' || s === 'WEB' ? s : null;
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
