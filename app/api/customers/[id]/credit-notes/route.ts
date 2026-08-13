import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/**
 * Avoirs d'un client : ceux nés d'une reprise de produit (rattachés au client
 * de la vente d'origine) comme ceux émis directement au client.
 *
 * Le rattachement suit la même règle que le solde (COALESCE) : l'avoir compte
 * pour ce client s'il porte son `customer_id`, ou à défaut celui de la vente ou
 * de la facture d'origine. On retombe sur la jointure seule si la colonne
 * `credit_notes.customer_id` n'existe pas encore (migration 0014).
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('customers.read');
  if ('response' in g) return g.response;

  interface Row {
    id: string; number: string; created_at: string;
    amount: string; used_amount: string; remaining: string;
    status: string; reason: string | null; receipt_number: string | null;
  }

  const select = (customerJoin: string) => `
    SELECT cn.id, cn.number, cn.created_at,
           cn.amount::text AS amount, cn.used_amount::text AS used_amount,
           (cn.amount - cn.used_amount)::text AS remaining,
           cn.status, cn.reason, s.receipt_number
      FROM credit_notes cn
      LEFT JOIN sales s ON s.id = cn.sale_id
      LEFT JOIN invoices i ON i.id = cn.invoice_id
     WHERE cn.organization_id = $1
       AND ${customerJoin} = $2
     ORDER BY cn.created_at DESC`;

  const rows = await query<Row>(
    select('COALESCE(cn.customer_id, s.customer_id, i.customer_id)'),
    [g.user.organizationId, params.id],
  ).catch(async (err) => {
    if (!(err as Error).message?.includes('customer_id')) {
      // eslint-disable-next-line no-console
      console.error('[customers.credit-notes] échoué :', err);
    }
    return query<Row>(
      select('COALESCE(s.customer_id, i.customer_id)'),
      [g.user.organizationId, params.id],
    ).catch(() => ({ rows: [] as Row[] }));
  });

  return NextResponse.json({
    credit_notes: rows.rows.map((r) => ({
      id: r.id, number: r.number, created_at: r.created_at,
      amount: Number(r.amount), used_amount: Number(r.used_amount),
      remaining: Number(r.remaining), status: r.status,
      reason: r.reason, receipt_number: r.receipt_number,
    })),
  });
}
