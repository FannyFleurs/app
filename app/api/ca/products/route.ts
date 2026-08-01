import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requireSession } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

const SORTS = ['ca_ttc', 'quantity', 'marge_ht', 'product_name'] as const;

const paramsSchema = z.object({
  store_id: z.string().uuid().optional().nullable(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sort: z.enum(SORTS).default('ca_ttc'),
  order: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/**
 * Liste des produits vendus dans la periode, avec CA, quantite,
 * marge. Triable par n'importe quel indicateur, asc ou desc.
 */
export async function GET(req: Request) {
  const g = await requireSession();
  if ('response' in g) return g.response;

  const url = new URL(req.url);
  const parsed = paramsSchema.safeParse({
    store_id: url.searchParams.get('store_id') || undefined,
    from: url.searchParams.get('from'),
    to:   url.searchParams.get('to'),
    sort: url.searchParams.get('sort') ?? 'ca_ttc',
    order: url.searchParams.get('order') ?? 'desc',
    limit: url.searchParams.get('limit') ?? '100',
  });
  if (!parsed.success) return jsonError('INVALID_PARAMS', 400);
  const { store_id, from, to, sort, order, limit } = parsed.data;

  const storeFilter = store_id ? 'AND s.store_id = $4' : '';
  // On trie sur l'EXPRESSION numérique (pas sur l'alias casté en ::text, qui
  // triait lexicographiquement : « 95.60 » puis « 9.90 » puis « 53.20 »…).
  const SORT_EXPR: Record<typeof sort, string> = {
    ca_ttc: 'SUM(sl.line_ttc)',
    quantity: 'SUM(sl.quantity)',
    marge_ht: '(SUM(sl.line_ht) - SUM(COALESCE(p.purchase_price_ht, 0) * sl.quantity))',
    product_name: 'COALESCE(p.name, sl.label)',
  };
  const orderClause = `${SORT_EXPR[sort]} ${order.toUpperCase()}`;

  const args: unknown[] = [g.user.organizationId, from, to];
  if (store_id) args.push(store_id);
  args.push(limit);
  const limitIdx = args.length;

  const r = await query<{
    product_id: string | null; product_name: string;
    category_name: string | null;
    quantity: string; ca_ttc: string; ca_ht: string;
    cost_ht: string; marge_ht: string;
  }>(
    `SELECT sl.product_id,
            COALESCE(p.name, sl.label) AS product_name,
            c.name AS category_name,
            SUM(sl.quantity)::text AS quantity,
            SUM(sl.line_ttc)::text AS ca_ttc,
            SUM(sl.line_ht)::text AS ca_ht,
            SUM(COALESCE(p.purchase_price_ht, 0) * sl.quantity)::text AS cost_ht,
            (SUM(sl.line_ht) - SUM(COALESCE(p.purchase_price_ht, 0) * sl.quantity))::text AS marge_ht
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
       LEFT JOIN products p ON p.id = sl.product_id
       LEFT JOIN product_categories c ON c.id = p.category_id
      WHERE s.organization_id = $1
        AND s.status = 'validated'
        AND s.validated_at::date BETWEEN $2::date AND $3::date
        ${storeFilter}
      GROUP BY sl.product_id, COALESCE(p.name, sl.label), c.name
      ORDER BY ${orderClause}
      LIMIT $${limitIdx}`,
    args,
  );

  return NextResponse.json({
    products: r.rows.map((row) => ({
      product_id: row.product_id,
      product_name: row.product_name,
      category_name: row.category_name,
      quantity: Number(row.quantity),
      ca_ttc: Number(row.ca_ttc),
      ca_ht: Number(row.ca_ht),
      cost_ht: Number(row.cost_ht),
      marge_ht: Number(row.marge_ht),
      marge_pct: Number(row.ca_ht) > 0
        ? Number(((Number(row.marge_ht) / Number(row.ca_ht)) * 100).toFixed(1))
        : 0,
    })),
  });
}
