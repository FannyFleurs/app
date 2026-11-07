import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { listClosurePayments } from '@/lib/services/closure-preview';

/**
 * Détail, paiement par paiement, d'un mode de règlement pour une clôture
 * (boutique, date) — permet de pointer 1 à 1 les tickets lors d'un écart de
 * caisse, sans rien changer à la réconciliation elle-même (voir
 * listClosurePayments).
 */
export async function GET(req: Request) {
  const g = await requirePermission('closures.daily');
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  const storeId = url.searchParams.get('store_id');
  const date = url.searchParams.get('date');
  const method = url.searchParams.get('method');
  if (!storeId || !date || !method) return jsonError('store_id, date et method requis', 400);

  const payments = await listClosurePayments(storeId, date, method);
  return NextResponse.json({ payments });
}
