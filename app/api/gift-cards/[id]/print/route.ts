import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import {
  enqueueGiftCardPrint, NoReceiptPrinterError, GiftCardNotFoundError,
} from '@/lib/services/cloudprnt/print-gift-card';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  copies: z.number().int().min(1).max(5).optional(),
}).optional();

/** Imprime une carte cadeau sur l'imprimante TICKET de la boutique. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  try {
    const out = await enqueueGiftCardPrint({
      organizationId: g.user.organizationId,
      userId: g.user.id,
      giftCardId: params.id,
      copies: parsed.data?.copies,
    });
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    if (e instanceof NoReceiptPrinterError) return jsonError('NO_PRINTER', 409);
    if (e instanceof GiftCardNotFoundError) return jsonError('NOT_FOUND', 404);
    throw e;
  }
}
