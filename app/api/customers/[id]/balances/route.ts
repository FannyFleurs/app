import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import {
  mergeWithDefaults, POS_UI_KEY, loyaltyGroupKey, type PosUiSettings,
} from '@/lib/settings/pos-ui';

/**
 * Renvoie tous les soldes du client utiles à afficher dans la zone ticket :
 *   - fidélité (points = euros)
 *   - cartes cadeau actives rattachées (sum des balance)
 *   - solde en compte (deferred non régularisé) — peut être négatif (le client doit)
 *   - avoirs disponibles (credit_notes open/partial)
 *
 * Fallback gracieux si une migration n'est pas encore appliquée.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('customers.read');
  if ('response' in g) return g.response;

  // Fidélité : solde du GROUPE de la boutique du poste (si store_id fourni),
  // sinon total tous groupes. Compatible avec l'ancien schéma (sans group_key).
  const storeId = new URL(req.url).searchParams.get('store_id');
  let loyaltyBalance = 0;
  try {
    if (storeId) {
      const st = await query<{ value: Partial<PosUiSettings> }>(
        `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
        [g.user.organizationId, POS_UI_KEY],
      );
      const ui = mergeWithDefaults(st.rows[0]?.value ?? null);
      const groupKey = loyaltyGroupKey(ui.loyalty, storeId);
      const r = await query<{ points_balance: string }>(
        `SELECT points_balance::text FROM loyalty_accounts
          WHERE customer_id = $1 AND group_key = $2`,
        [params.id, groupKey],
      );
      loyaltyBalance = Number(r.rows[0]?.points_balance ?? 0);
    } else {
      const r = await query<{ total: string }>(
        `SELECT COALESCE(SUM(points_balance),0)::text AS total
           FROM loyalty_accounts WHERE customer_id = $1`,
        [params.id],
      );
      loyaltyBalance = Number(r.rows[0]?.total ?? 0);
    }
  } catch {
    const r = await query<{ points_balance: string }>(
      `SELECT points_balance::text FROM loyalty_accounts WHERE customer_id = $1`,
      [params.id],
    ).catch(() => ({ rows: [] as { points_balance: string }[] }));
    loyaltyBalance = Number(r.rows[0]?.points_balance ?? 0);
  }

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
        AND COALESCE(cn.customer_id, s.customer_id, i.customer_id) = $2
        AND cn.status IN ('open','partially_used')`,
    [g.user.organizationId, params.id],
  ).catch((err) => {
    if (!(err as Error).message?.includes('customer_id')) {
      // eslint-disable-next-line no-console
      console.error('[customers.balances] credit_notes échoué :', err);
    }
    // Fallback sans cn.customer_id (migration 0014 pas appliquée)
    return query<{ id: string; number: string; remaining: string }>(
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
  });

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
    loyalty_balance: loyaltyBalance,
    gift_card_balance: giftCards.rows.reduce((s, c) => s + Number(c.balance), 0),
    gift_cards: giftCards.rows,
    account_balance: accountBalance,
    credit_notes_balance: creditNotes.rows.reduce((s, c) => s + Number(c.remaining), 0),
    credit_notes: creditNotes.rows,
  });
}
