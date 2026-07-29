import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guards';
import { accessibleStores, storeInOrg } from '@/lib/auth/stores-server';
import { computeDayReport } from '@/lib/services/day-report';
import { resolveDeviceStoreId } from '@/lib/pos/current-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Rapport de journée X (en cours, non scellé) pour une boutique + date. */
export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;

  const url = new URL(req.url);
  const date = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  let storeId = url.searchParams.get('store_id');
  if (storeId) {
    if (!(await storeInOrg(storeId, g.user.organizationId))) {
      return NextResponse.json({ error: 'STORE_NOT_FOUND' }, { status: 400 });
    }
  } else {
    // Sans store_id explicite : on prend la boutique du POSTE (caisse appairée
    // au device) pour que le X reflète la boutique où l'on encaisse, et non la
    // première boutique de l'organisation. Repli : 1re boutique accessible.
    storeId = (await resolveDeviceStoreId(g.user.organizationId))
      ?? (await accessibleStores(g.user))[0]?.id
      ?? null;
  }
  if (!storeId) return NextResponse.json({ error: 'NO_STORE' }, { status: 400 });

  const report = await computeDayReport({
    organizationId: g.user.organizationId,
    storeId,
    businessDate: date,
    kind: 'X',
    printedAt: new Date().toISOString(),
  });
  return NextResponse.json({ report });
}
