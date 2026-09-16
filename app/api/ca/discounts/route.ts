import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requireSession } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  store_id: z.string().uuid().optional().nullable(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Lignes de remises de la période, pour le dashboard CA : chaque vente remisée
 * avec son montant de remise, son taux (remise / CA brut) et son motif.
 *
 * Le motif d'une remise manuelle n'existe qu'au niveau LIGNE
 * (`sale_lines.metadata` : `cart_discount_reason` pour une remise panier,
 * `manual_discount_reason` pour une remise article). La remise systématique
 * client (`auto_discount_pct`) est libellée « Remise client » ; le reste, sans
 * trace, « Sans motif ».
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

  const rowsRes = await query<{
    id: string; receipt: string | null; date: string;
    cashier: string | null; discount: string; ttc: string; motif: string | null;
  }>(
    `SELECT s.id, s.receipt_number AS receipt, s.validated_at::text AS date,
            u.full_name AS cashier,
            s.total_discount::text AS discount, s.total_ttc::text AS ttc,
            m.motif
       FROM sales s
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(
                  MAX(NULLIF(sl.metadata->>'cart_discount_reason', '')),
                  MAX(NULLIF(sl.metadata->>'manual_discount_reason', '')),
                  CASE WHEN bool_or(COALESCE(NULLIF(sl.metadata->>'auto_discount_pct', '')::numeric, 0) > 0)
                       THEN 'Remise client' END
                ) AS motif
           FROM sale_lines sl WHERE sl.sale_id = s.id
       ) m ON TRUE
      WHERE s.organization_id = $1 AND s.status = 'validated'
        AND s.validated_at::date BETWEEN $2::date AND $3::date
        AND s.total_discount > 0
        ${storeFilter}
      ORDER BY s.total_discount DESC, s.validated_at DESC
      LIMIT 200`,
    args,
  );

  let total = 0;
  const rows = rowsRes.rows.map((r) => {
    const discount = Number(r.discount);
    const ttc = Number(r.ttc);
    const gross = ttc + discount;
    total += discount;
    return {
      id: r.id,
      receipt: r.receipt,
      date: r.date,
      cashier: r.cashier,
      montant: discount,
      taux: gross > 0 ? Number(((discount / gross) * 100).toFixed(1)) : 0,
      motif: r.motif,
    };
  });

  return NextResponse.json({ total: Number(total.toFixed(2)), rows });
}
