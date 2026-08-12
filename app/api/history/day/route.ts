import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guards';
import { accessibleStores, storeInOrg } from '@/lib/auth/stores-server';
import { resolveDeviceStoreId } from '@/lib/pos/current-store';
import { computeDayHistory } from '@/lib/services/day-history';

export const dynamic = 'force-dynamic';

/**
 * Journal d'une journée pour une boutique.
 *
 * Réservé à `closures.daily` : c'est le registre des espèces et des gestes
 * sensibles — qui a ouvert le tiroir, qui a annulé une vente. Il regarde le
 * travail des vendeurs, ce n'est pas à eux qu'il s'adresse.
 */
export async function GET(req: Request) {
  const g = await requirePermission('closures.daily');
  if ('response' in g) return g.response;

  const url = new URL(req.url);
  const date = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'INVALID_DATE' }, { status: 400 });
  }

  let storeId = url.searchParams.get('store_id');
  if (storeId) {
    if (!(await storeInOrg(storeId, g.user.organizationId))) {
      return NextResponse.json({ error: 'STORE_NOT_FOUND' }, { status: 400 });
    }
  } else {
    // Comme le X : la boutique du poste d'abord, sinon la première accessible.
    storeId = (await resolveDeviceStoreId(g.user.organizationId))
      ?? (await accessibleStores(g.user))[0]?.id
      ?? null;
  }
  if (!storeId) return NextResponse.json({ error: 'NO_STORE' }, { status: 400 });

  const history = await computeDayHistory({
    organizationId: g.user.organizationId,
    storeId,
    date,
  });
  return NextResponse.json({ history, store_id: storeId });
}
