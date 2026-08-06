import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { reportRange, localDay } from '@/lib/reports/range';

export const dynamic = 'force-dynamic';

/**
 * Remboursements : tout ce qui est sorti de la caisse au profit d'un client.
 *
 * Chaque avoir émis sur la période, qu'il provienne d'une annulation de vente
 * ou d'un retour de marchandise. Le motif distingue les deux — c'est ce qui
 * permet de suivre les retours sans les confondre avec les erreurs de saisie.
 */
export async function GET(req: Request) {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;

  const range = reportRange(req, g.user.organizationId);
  if ('response' in range) return range.response;
  const { from, to, storeId, args } = range;
  const storeFilter = storeId ? 'AND s.store_id = $4' : '';
  const DAY = localDay('cn.created_at');

  const { rows } = await query<{
    id: string; created_at: string; number: string; amount: string;
    reason: string; refund_method: string | null;
    receipt_number: string | null; seller: string | null;
    customer: string | null; store: string | null;
  }>(
    `SELECT cn.id,
            cn.created_at::text AS created_at,
            cn.number,
            cn.amount::text AS amount,
            cn.reason,
            cn.refund_method,
            s.receipt_number,
            u.full_name AS seller,
            COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name, ' ', c.last_name)), '')) AS customer,
            st.name AS store
       FROM credit_notes cn
       LEFT JOIN sales s ON s.id = cn.sale_id
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN customers c ON c.id = COALESCE(cn.customer_id, s.customer_id)
       LEFT JOIN stores st ON st.id = s.store_id
      WHERE cn.organization_id = $1
        AND cn.status <> 'cancelled'
        AND ${DAY} BETWEEN $2::date AND $3::date
        ${storeFilter}
      ORDER BY cn.created_at DESC
      LIMIT 1000`,
    args,
  );

  const lines = rows.map((r) => ({
    id: r.id,
    date: r.created_at,
    number: r.number,
    receipt: r.receipt_number,
    seller: r.seller,
    customer: r.customer,
    store: r.store,
    // « Annulation » vient du service d'annulation, tout le reste est un retour.
    kind: r.refund_method === 'cancellation' || /annulation/i.test(r.reason)
      ? 'cancellation' as const
      : 'return' as const,
    reason: r.reason,
    amount: Number(r.amount),
  }));

  return NextResponse.json({
    lines,
    totals: {
      count: lines.length,
      amount: Number(lines.reduce((s, l) => s + l.amount, 0).toFixed(2)),
      cancellations: Number(
        lines.filter((l) => l.kind === 'cancellation').reduce((s, l) => s + l.amount, 0).toFixed(2),
      ),
      returns: Number(
        lines.filter((l) => l.kind === 'return').reduce((s, l) => s + l.amount, 0).toFixed(2),
      ),
    },
    from, to, store_id: storeId,
  });
}
