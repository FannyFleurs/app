import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { reportRange, localDay } from '@/lib/reports/range';

export const dynamic = 'force-dynamic';

/**
 * Avoirs et bons cadeaux émis sur la période.
 *
 * Trois natures d'engagement envers un client sont réunies ici, parce qu'elles
 * représentent la même chose au bilan — de l'argent dû sous forme de bon :
 * l'avoir issu d'un retour, la carte cadeau vendue, le bon d'achat offert.
 *
 * Le montant restant compte autant que le montant émis : c'est lui qui reste
 * exigible.
 */
export async function GET(req: Request) {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;

  const range = reportRange(req, g.user.organizationId);
  if ('response' in range) return range.response;
  const { from, to, storeId } = range;
  // Cartes et avoirs ne portent pas de boutique : le filtre boutique ne
  // s'applique pas ici, on l'ignore volontairement plutôt que de renvoyer
  // une liste vide qui laisserait croire à une absence d'engagements.
  const args: unknown[] = [g.user.organizationId, from, to];

  const credits = await query<{
    id: string; created_at: string; number: string; amount: string;
    used: string; status: string; customer: string | null;
  }>(
    `SELECT cn.id, cn.created_at::text AS created_at, cn.number,
            cn.amount::text AS amount, cn.used_amount::text AS used, cn.status,
            COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name, ' ', c.last_name)), '')) AS customer
       FROM credit_notes cn
       LEFT JOIN customers c ON c.id = cn.customer_id
      WHERE cn.organization_id = $1
        AND cn.status <> 'cancelled'
        AND ${localDay('cn.created_at')} BETWEEN $2::date AND $3::date
      ORDER BY cn.created_at DESC
      LIMIT 1000`,
    args,
  );

  const cards = await query<{
    id: string; issued_at: string; code: string; kind: string | null;
    initial: string; balance: string; status: string;
    expires_at: string | null; customer: string | null;
  }>(
    `SELECT gc.id, gc.issued_at::text AS issued_at, gc.code,
            gc.kind, gc.initial_amount::text AS initial, gc.balance::text AS balance,
            gc.status, gc.expires_at::text AS expires_at,
            COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name, ' ', c.last_name)), '')) AS customer
       FROM gift_cards gc
       LEFT JOIN customers c ON c.id = COALESCE(gc.beneficiary_id, gc.buyer_id)
      WHERE gc.organization_id = $1
        AND gc.status <> 'cancelled'
        AND ${localDay('gc.issued_at')} BETWEEN $2::date AND $3::date
      ORDER BY gc.issued_at DESC
      LIMIT 1000`,
    args,
  ).catch(() => ({ rows: [] as never[] }));

  const n = (v: string | null) => Number(v ?? 0);

  const lines = [
    ...credits.rows.map((r) => ({
      id: r.id,
      date: r.created_at,
      type: 'credit_note' as const,
      reference: r.number,
      customer: r.customer,
      amount: n(r.amount),
      remaining: Number((n(r.amount) - n(r.used)).toFixed(2)),
      expires_at: null as string | null,
      status: r.status,
    })),
    ...cards.rows.map((r) => ({
      id: r.id,
      date: r.issued_at,
      type: (r.kind === 'voucher' ? 'voucher' : 'gift_card') as 'voucher' | 'gift_card',
      reference: r.code,
      customer: r.customer,
      amount: n(r.initial),
      remaining: n(r.balance),
      expires_at: r.expires_at,
      status: r.status,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return NextResponse.json({
    lines,
    totals: {
      count: lines.length,
      amount: Number(lines.reduce((s, l) => s + l.amount, 0).toFixed(2)),
      remaining: Number(lines.reduce((s, l) => s + l.remaining, 0).toFixed(2)),
    },
    from, to, store_id: storeId,
  });
}
