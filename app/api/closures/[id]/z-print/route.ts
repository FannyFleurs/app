import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { enqueueZReportPrint } from '@/lib/services/cloudprnt/print-report';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Impression (ou réimpression) manuelle du Z sur l'imprimante ticket. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('closures.daily');
  if ('response' in g) return g.response;

  const r = await enqueueZReportPrint({
    organizationId: g.user.organizationId,
    userId: g.user.id,
    closureId: params.id,
    force: true,
  });
  if (r.printed) return NextResponse.json({ ok: true });
  if (r.reason === 'NO_PRINTER') return jsonError('NO_PRINTER', 409);
  if (r.reason === 'NOT_FOUND') return jsonError('NOT_FOUND', 404);
  return jsonError(r.reason ?? 'PRINT_FAILED', 400);
}
