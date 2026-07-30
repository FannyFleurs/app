import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { computeClosurePreview } from '@/lib/services/closure-preview';

/**
 * Renvoie les totaux calculés pour une date de clôture donnée (sans rien sceller).
 * Utilisé par l'UI de clôture pour afficher ce qui va être figé.
 */
export async function GET(req: Request) {
  const g = await requirePermission('closures.daily');
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  const storeId = url.searchParams.get('store_id');
  const date = url.searchParams.get('date');
  if (!storeId || !date) return jsonError('store_id et date requis', 400);

  return NextResponse.json(await computeClosurePreview(storeId, date));
}
