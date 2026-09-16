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
 * Ventes par vendeur : nb de tickets, CA TTC, panier moyen.
 * Ordonne par CA descendant.
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

  const r = await query<{
    user_id: string; full_name: string;
    tickets_count: number; ca_ttc: string; ca_ht: string; discount: string;
  }>(
    // La remise par vendeur exclut les cartes cadeaux / bons d'achat
    // (metadata.gift_card) : ils ne comptent pas comme des remises.
    `SELECT s.user_id, u.full_name,
            COUNT(*)::int AS tickets_count,
            SUM(s.total_ttc)::text AS ca_ttc,
            SUM(s.total_ht)::text AS ca_ht,
            COALESCE(SUM(d.real_discount), 0)::text AS discount
       FROM sales s
       JOIN users u ON u.id = s.user_id
       JOIN LATERAL (
         SELECT COALESCE(SUM(sl.discount_amount)
                  FILTER (WHERE COALESCE(sl.metadata->>'gift_card', '') <> 'true'), 0) AS real_discount
           FROM sale_lines sl WHERE sl.sale_id = s.id
       ) d ON TRUE
      WHERE s.organization_id = $1
        AND s.status = 'validated'
        AND s.validated_at::date BETWEEN $2::date AND $3::date
        ${storeFilter}
      GROUP BY s.user_id, u.full_name
      ORDER BY ca_ttc DESC`,
    args,
  );

  return NextResponse.json({
    vendors: r.rows.map((v) => {
      const caTtc = Number(v.ca_ttc);
      const discount = Number(v.discount);
      // Taux de remise = remise / CA brut (TTC + remise accordée).
      const gross = caTtc + discount;
      return {
        user_id: v.user_id,
        full_name: v.full_name,
        tickets_count: v.tickets_count,
        ca_ttc: caTtc,
        ca_ht: Number(v.ca_ht),
        discount,
        discount_rate: gross > 0 ? Number(((discount / gross) * 100).toFixed(1)) : 0,
        avg_ticket_ttc: v.tickets_count > 0
          ? Number((caTtc / v.tickets_count).toFixed(2))
          : 0,
      };
    }),
  });
}
