import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';

/**
 * Renvoie tous les soldes du client utiles à afficher dans la zone ticket :
 *   - fidélité (points = euros)
 *   - cartes cadeau actives rattachées (sum des balance)
 *   - solde en compte (deferred non régularisé) — peut être négatif (le client doit)
 *   - avoirs disponibles (credit_notes open/partial)
 *
 * Fallback gracieux si une migration n'est pas encore appliquée.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('customers.read');
  if ('response' in g) return g.response;

  const loyalty = await query<{ points_balance: string }>(
    `SELECT points_balance::text FROM loyalty_accounts WHERE customer_id = $1`,
    [params.id],
  );

  const giftCards = await query<{ id: string; code: string; balance: string }>(
    `SELECT id, code, balance::text
       FROM gift_cards
      WHERE organization_id = $1
        AND beneficiary_id = $2
        AND status IN ('active','partially_used')
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY issued_at DESC`,
    [g.user.organizationId, params.id],
  ).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[customers.balances] gift_cards échoué :', err);
    return { rows: [] as { id: string; code: string; balance: string }[] };
  });

  const creditNotes = await query<{ id: string; number: string; remaining: string }>(
    `SELECT cn.id, cn.number,
            (cn.amount - cn.used_amount)::text AS remaining
       FROM credit_notes cn
       LEFT JOIN sales s ON s.id = cn.sale_id
       LEFT JOIN invoices i ON i.id = cn.invoice_id
      WHERE cn.organization_id = $1
        AND COALESCE(s.customer_id, i.customer_id) = $2
        AND cn.status IN ('open','partially_used')`,
    [g.user.organizationId, params.id],
  ).catch(() => ({ rows: [] as { id: string; number: string; remaining: string }[] }));

  let accountBalance = 0;
  try {
    const r = await query<{ account_balance: string }>(
      `SELECT COALESCE(account_balance, 0)::text AS account_balance
         FROM customers WHERE id = $1`,
      [params.id],
    );
    accountBalance = Number(r.rows[0]?.account_balance ?? 0);
  } catch { /* migration 0012 absente : 0 */ }

  return NextResponse.json({
    loyalty_balance: Number(loyalty.rows[0]?.points_balance ?? 0),
    gift_card_balance: giftCards.rows.reduce((s, c) => s + Number(c.balance), 0),
    gift_cards: giftCards.rows,
    account_balance: accountBalance,
    credit_notes_balance: creditNotes.rows.reduce((s, c) => s + Number(c.remaining), 0),
    credit_notes: creditNotes.rows,
  });
}
