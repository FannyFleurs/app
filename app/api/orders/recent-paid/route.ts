import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/**
 * Renvoie les commandes passées en 'paid' depuis le timestamp ISO `since`
 * (par défaut : 10 secondes). Utilisé par le client pour afficher une
 * notification temps réel quand un paiement Stripe est validé via webhook.
 */
export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;

  const url = new URL(req.url);
  const since = url.searchParams.get('since');
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 10_000);
  if (Number.isNaN(sinceDate.getTime())) {
    return NextResponse.json({ orders: [] });
  }

  try {
    const { rows } = await query<{
      id: string; number: string | null;
      total_amount: string; paid_at: string;
      customer_name: string | null;
      recipient_name: string | null;
      pickup_or_delivery: string;
    }>(
      `SELECT o.id, o.number, o.total_amount::text, o.paid_at,
              COALESCE(c.company_name,
                NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS customer_name,
              o.recipient_name,
              o.pickup_or_delivery
         FROM orders o
         LEFT JOIN customers c ON c.id = o.customer_id
        WHERE o.organization_id = $1
          AND o.payment_status = 'paid'
          AND o.paid_at > $2
        ORDER BY o.paid_at DESC
        LIMIT 20`,
      [g.user.organizationId, sinceDate.toISOString()],
    );
    return NextResponse.json({ orders: rows, server_now: new Date().toISOString() });
  } catch (err) {
    // Migration 0016 pas appliquée : on retourne vide silencieusement
    if (!(err as Error).message?.includes('payment_status')) {
      // eslint-disable-next-line no-console
      console.error('[orders.recent-paid]', err);
    }
    return NextResponse.json({ orders: [], server_now: new Date().toISOString() });
  }
}
