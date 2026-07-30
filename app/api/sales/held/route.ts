import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { SaleService } from '@/lib/services/sale-service';
import { resolveDeviceStoreId } from '@/lib/pos/current-store';

export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  // Tickets en attente PARTAGÉS à l'échelle de la BOUTIQUE (toutes les caisses
  // d'une même boutique). Repli sur la boutique du poste (cookie device) si le
  // client n'envoie pas store_id.
  let storeId = new URL(req.url).searchParams.get('store_id');
  if (!storeId) storeId = await resolveDeviceStoreId(g.user.organizationId);
  if (!storeId) return jsonError('store_id requis', 400);
  const rows = await SaleService.listHeld(g.user.organizationId, storeId);
  return NextResponse.json({ held: rows });
}
