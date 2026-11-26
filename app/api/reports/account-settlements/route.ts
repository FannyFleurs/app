import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { reportRange, localDay } from '@/lib/reports/range';

export const dynamic = 'force-dynamic';

/**
 * Règlements de comptes clients sur la période : chaque fois qu'un solde « en
 * compte » a été réglé (facture soldée, ou règlement direct depuis la fiche
 * client / l'écran de paiement), avec qui l'a saisi, pour quel client,
 * combien, par quel moyen et dans quelle boutique.
 *
 * Source unique : account_settlement_payments, alimentée par les trois
 * chemins de règlement (InvoiceService.settleInvoice / settleAccount /
 * settleAccountWithPayments) — jamais les ventes elles-mêmes, qui ne
 * reflètent que l'ENGAGEMENT (règlement différé), pas son règlement.
 */
export async function GET(req: Request) {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;

  const range = reportRange(req, g.user.organizationId);
  if ('response' in range) return range.response;
  const { from, to, storeId, args } = range;
  const storeFilter = storeId ? 'AND asp.store_id = $4' : '';
  const DAY = localDay('asp.created_at');

  const { rows } = await query<{
    id: string; settled_at: string; cashier: string | null;
    customer: string | null; store: string | null;
    method: string; amount: string; reference: string | null;
  }>(
    `SELECT asp.id,
            asp.created_at::text AS settled_at,
            u.full_name AS cashier,
            COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name, ' ', c.last_name)), '')) AS customer,
            st.name AS store,
            asp.method,
            asp.amount::text,
            asp.reference
       FROM account_settlement_payments asp
       LEFT JOIN users u ON u.id = asp.user_id
       LEFT JOIN customers c ON c.id = asp.customer_id
       LEFT JOIN stores st ON st.id = asp.store_id
      WHERE asp.organization_id = $1
        AND ${DAY} BETWEEN $2::date AND $3::date
        ${storeFilter}
      ORDER BY asp.created_at DESC
      LIMIT 1000`,
    args,
  );

  const lines = rows.map((r) => ({
    id: r.id,
    date: r.settled_at,
    cashier: r.cashier,
    customer: r.customer,
    store: r.store,
    method: r.method,
    amount: Number(r.amount),
    reference: r.reference,
  }));

  const byMethod: Record<string, number> = {};
  for (const l of lines) byMethod[l.method] = round((byMethod[l.method] ?? 0) + l.amount);

  return NextResponse.json({
    lines,
    totals: {
      count: lines.length,
      amount: round(lines.reduce((s, l) => s + l.amount, 0)),
      by_method: byMethod,
    },
    from, to, store_id: storeId,
  });
}

function round(v: number) { return Number(v.toFixed(2)); }
