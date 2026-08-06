import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  store_id: z.string().uuid().optional().nullable(),
});

/**
 * Rapport des lignes de vente, agrégé par article sur la période.
 *
 * Répond à « qu'est-ce qui s'est vendu, en quelle quantité, et combien ça a
 * rapporté ». Le libellé vient de la ligne de vente (snapshot au moment de la
 * vente) et non de la fiche article : un article renommé depuis reste lisible
 * tel qu'il a été vendu.
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
    label: string; sku: string | null; barcode: string | null;
    category: string | null; quantity: string;
    ht: string; tva: string; ttc: string; discount: string;
    cost: string; costed_lines: number;
  }>(
    `SELECT sl.label,
            MAX(p.sku)     AS sku,
            MAX(p.barcode) AS barcode,
            MAX(c.name)    AS category,
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
       LEFT JOIN product_categories c ON c.id = p.category_id
      WHERE s.organization_id = $1
        AND s.status = 'validated'
        AND ${DAY} BETWEEN $2::date AND $3::date
        ${storeFilter}
      GROUP BY sl.label
      ORDER BY SUM(sl.line_ttc) DESC
      LIMIT 500`,
    args,
  );

  const num = (v: string | null) => Number(v ?? 0);
  const lines = rows.map((r) => {
    const ht = num(r.ht);
    const cost = num(r.cost);
    return {
      label: r.label,
      sku: r.sku,
      barcode: r.barcode,
      category: r.category,
      quantity: num(r.quantity),
      ht,
      tva: num(r.tva),
      ttc: num(r.ttc),
      discount: num(r.discount),
      // Marge nulle si aucun prix d'achat connu : mieux vaut un tiret qu'un
      // chiffre faux.
      margin: r.costed_lines > 0 ? Number((ht - cost).toFixed(2)) : null,
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
