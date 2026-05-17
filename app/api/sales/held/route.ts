import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { SaleService } from '@/lib/services/sale-service';

export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const registerId = new URL(req.url).searchParams.get('register_id');
  if (!registerId) return jsonError('register_id requis', 400);
  const rows = await SaleService.listHeld(g.user.organizationId, registerId);
  return NextResponse.json({ held: rows });
}
