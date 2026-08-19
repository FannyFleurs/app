import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guards';
import { accessibleStores, storeInOrg } from '@/lib/auth/stores-server';
import { resolveDeviceStoreId } from '@/lib/pos/current-store';
import { computeDayReport } from '@/lib/services/day-report';
import { renderReportPdf } from '@/lib/services/z-report-pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** PDF du rapport X (en cours), identique au Z mais titré « X ». */
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
    // Boutique du POSTE en priorité (pas la 1re boutique de l'org).
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
  // ?ticket=1 : rendu 80 mm pour impression réseau native (app iOS/Android).
  const thermal = url.searchParams.get('ticket') === '1';
  const buf = await renderReportPdf(report, { thermal });
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="X-${date}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
