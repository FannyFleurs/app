import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';

/**
 * Recherche d'un avoir par numéro pour usage en paiement.
 * Renvoie le solde disponible (amount - used_amount) et le statut.
 */
export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const number = new URL(req.url).searchParams.get('number')?.trim();
  if (!number) return jsonError('number requis', 400);

  const { rows } = await query<{
    id: string; number: string; amount: string; used_amount: string;
    status: string; reason: string;
  }>(
    `SELECT id, number, amount::text, used_amount::text, status, reason
       FROM credit_notes
      WHERE organization_id = $1 AND number = $2`,
    [g.user.organizationId, number],
  );
  if (rows.length === 0) return jsonError('NOT_FOUND', 404);

  const cn = rows[0]!;
  const remaining = Number(cn.amount) - Number(cn.used_amount);
  return NextResponse.json({
    id: cn.id,
    number: cn.number,
    status: cn.status,
    initial_amount: Number(cn.amount),
    used_amount: Number(cn.used_amount),
    remaining,
    reason: cn.reason,
    usable: cn.status === 'open' || cn.status === 'partially_used',
  });
}
