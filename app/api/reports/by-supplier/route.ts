import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { EXCLUDE_GIFT_CARD_ISSUANCE_SQL } from '@/lib/analytics/gift-card-ca';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  store_id: z.string().uuid().optional().nullable(),
});

/**
 * Rapport des ventes par fournisseur sur la période : chiffre d'affaires,
 * marge et classement. Le fournisseur vient de la fiche produit
 * (products.supplier_id) ; une ligne sans produit (commande web/OGF) ou un
 * produit sans fournisseur renseigné rejoint « Sans fournisseur ».
 */
export async function GET(req: Request) {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;

  const url = new URL(req.url);
  const parsed = paramsSchema.safeParse({
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
    store_id: url.searchParams.get('store_id') || undefined,
  });
  if (!parsed.success) return jsonError('INVALID_PARAMS', 400);
  const { from, to, store_id: storeId } = parsed.data;

  const args: unknown[] = [g.user.organizationId, from, to];
  const storeFilter = storeId ? 'AND s.store_id = $4' : '';
  if (storeId) args.push(storeId);

  const DAY = `(s.validated_at AT TIME ZONE 'Europe/Paris')::date`;

  const { rows } = await query<{
    supplier: string; quantity: string;
    ht: string; tva: string; ttc: string; discount: string;
    cost: string; costed_lines: number;
  }>(
    `SELECT COALESCE(sup.name, 'Sans fournisseur') AS supplier,
            SUM(sl.quantity)::text        AS quantity,
            SUM(sl.line_ht)::text         AS ht,
            SUM(sl.line_tva)::text        AS tva,
            SUM(sl.line_ttc)::text        AS ttc,
            SUM(sl.discount_amount)::text AS discount,
            COALESCE(SUM(CASE WHEN p.purchase_price_ht > 0
                              THEN p.purchase_price_ht * sl.quantity ELSE 0 END), 0)::text AS cost,
            COUNT(*) FILTER (WHERE p.purchase_price_ht > 0)::int AS costed_lines
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
       LEFT JOIN products p ON p.id = sl.product_id
       LEFT JOIN suppliers sup ON sup.id = p.supplier_id
      WHERE s.organization_id = $1
        AND s.status = 'validated'
        AND ${DAY} BETWEEN $2::date AND $3::date
        AND ${EXCLUDE_GIFT_CARD_ISSUANCE_SQL}
        ${storeFilter}
      GROUP BY sup.id, COALESCE(sup.name, 'Sans fournisseur')
      ORDER BY SUM(sl.line_ttc) DESC
      LIMIT 500`,
    args,
  );

  const num = (v: string | null) => Number(v ?? 0);
  const lines = rows.map((r) => {
    const ht = num(r.ht);
    const cost = num(r.cost);
    const margin = r.costed_lines > 0 ? Number((ht - cost).toFixed(2)) : null;
    return {
      supplier: r.supplier,
      quantity: num(r.quantity),
      ht,
      tva: num(r.tva),
      ttc: num(r.ttc),
      discount: num(r.discount),
      margin,
      marge_pct: margin != null && ht > 0 ? Number(((margin / ht) * 100).toFixed(1)) : null,
    };
  });

  const totals = {
    quantity: Number(lines.reduce((s, l) => s + l.quantity, 0).toFixed(3)),
    ht: Number(lines.reduce((s, l) => s + l.ht, 0).toFixed(2)),
    tva: Number(lines.reduce((s, l) => s + l.tva, 0).toFixed(2)),
    ttc: Number(lines.reduce((s, l) => s + l.ttc, 0).toFixed(2)),
    discount: Number(lines.reduce((s, l) => s + l.discount, 0).toFixed(2)),
    margin: Number(lines.reduce((s, l) => s + (l.margin ?? 0), 0).toFixed(2)),
  };

  return NextResponse.json({ lines, totals });
}
