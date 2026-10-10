import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requireSession } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { importOnlyCaTotal } from '@/lib/analytics/revenue-blend';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  store_id: z.string().uuid().optional().nullable(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * KPIs synthetiques du dashboard chiffre d'affaires en direct.
 * Retourne : CA TTC/HT, TVA, marge, nombre de tickets, panier moyen,
 * clients uniques, articles vendus, nombre de produits distincts.
 */
export async function GET(req: Request) {
  const g = await requireSession();
  if ('response' in g) return g.response;

  const url = new URL(req.url);
  const parsed = paramsSchema.safeParse({
    store_id: url.searchParams.get('store_id') || undefined,
    from: url.searchParams.get('from'),
    to:   url.searchParams.get('to'),
  });
  if (!parsed.success) return jsonError('INVALID_PARAMS', 400);
  const { store_id, from, to } = parsed.data;

  const storeFilter = store_id ? 'AND s.store_id = $4' : '';
  const args: unknown[] = [g.user.organizationId, from, to];
  if (store_id) args.push(store_id);

  // Aggreg sur sales validees dans la periode. Le CA (ca_ttc/ht/tva) est
  // calcule plus bas depuis sale_lines (requete `margin`) pour EXCLURE les
  // lignes d'emission de carte cadeau/bon d'achat (encaissement, pas du
  // CA) — voir SaleService.validate. Ici : uniquement les agregats au
  // niveau TICKET (nombre, clients, panier max/min), qui restent bases sur
  // `sales` sans changement (un ticket contenant une carte cadeau reste un
  // ticket, meme si sa contribution au CA peut etre nulle).
  const sales = await query<{
    tickets_count: number; customers_count: number;
    max_ticket: string; min_ticket: string;
  }>(
    `SELECT COUNT(*)::int AS tickets_count,
            COUNT(DISTINCT customer_id)::int AS customers_count,
            COALESCE(MAX(total_ttc), 0)::text AS max_ticket,
            COALESCE(MIN(total_ttc), 0)::text AS min_ticket
       FROM sales s
      WHERE s.organization_id = $1
        AND s.status = 'validated'
        AND (s.validated_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2::date AND $3::date
        ${storeFilter}`,
    args,
  );
  const rowS = sales.rows[0]!;

  // Marge HT (basee sur purchase_price_ht courant du produit, quantite vendue)
  // + CA reel (ca_ttc/ca_ht/tva), qui exclut les lignes d'emission de carte
  // cadeau (metadata.gift_card_ca_deferred = true).
  const margin = await query<{
    items_sold: string; unique_products: number;
    revenue_ht: string; cost_ht: string; real_discount: string;
    ca_ttc: string; ca_ht: string; ca_tva: string;
  }>(
    // real_discount = remises sur les lignes SAUF cartes cadeaux / bons d'achat
    // (metadata.gift_card) : ceux-ci ne comptent pas comme des remises.
    `SELECT COALESCE(SUM(sl.quantity), 0)::text AS items_sold,
            COUNT(DISTINCT sl.product_id)::int AS unique_products,
            COALESCE(SUM(sl.line_ht) FILTER (WHERE COALESCE(sl.metadata->>'gift_card_ca_deferred','') <> 'true'), 0)::text AS revenue_ht,
            COALESCE(SUM(COALESCE(p.purchase_price_ht, 0) * sl.quantity) FILTER (WHERE COALESCE(sl.metadata->>'gift_card_ca_deferred','') <> 'true'), 0)::text AS cost_ht,
            COALESCE(SUM(sl.discount_amount)
              FILTER (WHERE COALESCE(sl.metadata->>'gift_card', '') <> 'true'), 0)::text AS real_discount,
            COALESCE(SUM(sl.line_ttc) FILTER (WHERE COALESCE(sl.metadata->>'gift_card_ca_deferred','') <> 'true'), 0)::text AS ca_ttc,
            COALESCE(SUM(sl.line_ht)  FILTER (WHERE COALESCE(sl.metadata->>'gift_card_ca_deferred','') <> 'true'), 0)::text AS ca_ht,
            COALESCE(SUM(sl.line_tva) FILTER (WHERE COALESCE(sl.metadata->>'gift_card_ca_deferred','') <> 'true'), 0)::text AS ca_tva
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
       LEFT JOIN products p ON p.id = sl.product_id
      WHERE s.organization_id = $1
        AND s.status = 'validated'
        AND (s.validated_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2::date AND $3::date
        ${storeFilter}`,
    args,
  );
  const rowM = margin.rows[0]!;

  // Historique importé (revenue_history) : comble les jours de la période
  // SANS vente réelle (ex. période antérieure à l'usage de HelloPos). Vient
  // s'AJOUTER au CA réel ci-dessus, jamais le remplacer — voir
  // lib/analytics/revenue-blend.ts pour pourquoi (exclusion carte cadeau).
  const imported = await importOnlyCaTotal({
    organizationId: g.user.organizationId, from, to, storeId: store_id ?? null,
  });

  const ca_ttc = Number(rowM.ca_ttc) + imported.ca_ttc;
  const ca_ht_total = Number(rowM.ca_ht) + imported.ca_ht;
  const revenue_ht = Number(rowM.revenue_ht);
  const cost_ht = Number(rowM.cost_ht);
  const marge_ht = Number((revenue_ht - cost_ht).toFixed(2));
  const marge_pct = revenue_ht > 0 ? Number(((marge_ht / revenue_ht) * 100).toFixed(1)) : 0;
  const tickets = Number(rowS.tickets_count) + imported.tickets;
  const avg_ticket_ttc = tickets > 0 ? Number((ca_ttc / tickets).toFixed(2)) : 0;

  return NextResponse.json({
    period: { from, to },
    ca_ttc,
    ca_ht: ca_ht_total,
    tva: Number(rowM.ca_tva),
    discount: Number(rowM.real_discount),
    marge_ht,
    marge_pct,
    cost_ht,
    tickets_count: tickets,
    avg_ticket_ttc,
    max_ticket_ttc: Number(rowS.max_ticket),
    customers_count: Number(rowS.customers_count),
    items_sold: Number(rowM.items_sold),
    unique_products_sold: Number(rowM.unique_products),
  });
}
