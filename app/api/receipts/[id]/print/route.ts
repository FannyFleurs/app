import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { enqueueReceiptPrint, NoReceiptPrinterError, ReceiptNotFoundError } from '@/lib/services/cloudprnt/print-receipt';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  gift: z.boolean().optional(),
  lines: z.array(z.number().int().min(0)).optional(),
}).optional();

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const body = parsed.data ?? {};

  try {
    const out = await enqueueReceiptPrint({
      organizationId: g.user.organizationId,
      userId: g.user.id,
      receiptId: params.id,
      gift: body.gift,
      giftLineIndices: body.lines ?? null,
    });
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    if (e instanceof NoReceiptPrinterError) return jsonError('NO_PRINTER', 409);
    if (e instanceof ReceiptNotFoundError) return jsonError('NOT_FOUND', 404);
    throw e;
  }
}
