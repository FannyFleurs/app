import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { accessibleStores, storeInOrg } from '@/lib/auth/stores-server';
import { computeDayReport } from '@/lib/services/day-report';
import { loadReceiptSettings } from '@/lib/settings/receipt-server';
import { resolveReceiptPrinter, enqueueJob } from '@/lib/services/cloudprnt/queue';
import { buildZReportStarPrnt, STARPRNT_CONTENT_TYPE } from '@/lib/services/cloudprnt/receipt-star';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  date: z.string().optional(),
  store_id: z.string().uuid().optional().nullable(),
});

/**
 * Impression DIRECTE du rapport X (journée en cours) sur l'imprimante TICKET
 * CloudPRNT — même rendu que le Z. Remplace l'ouverture du PDF.
 */
export async function POST(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;

  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const date = parsed.data.date ?? new Date().toISOString().slice(0, 10);

  let storeId = parsed.data.store_id ?? null;
  if (storeId) {
    if (!(await storeInOrg(storeId, g.user.organizationId))) {
      return NextResponse.json({ error: 'STORE_NOT_FOUND' }, { status: 400 });
    }
  } else {
    storeId = (await accessibleStores(g.user))[0]?.id ?? null;
  }
  if (!storeId) return NextResponse.json({ error: 'NO_STORE' }, { status: 400 });

  const printer = await resolveReceiptPrinter(g.user.organizationId, storeId);
  if (!printer) {
    return NextResponse.json(
      { error: 'NO_PRINTER', message: 'Aucune imprimante ticket configurée pour cette boutique.' },
      { status: 409 },
    );
  }

  const settings = await loadReceiptSettings(g.user.organizationId, storeId);
  const report = await computeDayReport({
    organizationId: g.user.organizationId,
    storeId,
    businessDate: date,
    kind: 'X',
    printedAt: new Date().toISOString(),
  });

  const payload = await buildZReportStarPrnt(report, settings, printer.paper_width);
  await enqueueJob({
    organizationId: g.user.organizationId,
    printerId: printer.id,
    contentType: STARPRNT_CONTENT_TYPE,
    payload,
    title: `Rapport X ${date}`,
    userId: g.user.id,
  });

  return NextResponse.json({ printed: true });
}
