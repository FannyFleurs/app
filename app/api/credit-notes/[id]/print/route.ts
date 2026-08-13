import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import {
  enqueueCreditNotePrint, NoReceiptPrinterError, CreditNoteNotFoundError,
} from '@/lib/services/cloudprnt/print-credit-note';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  // Nombre d'exemplaires forcé (réimpression). Absent = réglage de la boutique.
  copies: z.number().int().min(1).max(5).optional(),
}).optional();

/**
 * Imprime un avoir sur l'imprimante TICKET de la boutique, en N exemplaires
 * (réglage « Exemplaires d'avoir », 2 par défaut).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  try {
    const out = await enqueueCreditNotePrint({
      organizationId: g.user.organizationId,
      userId: g.user.id,
      creditNoteId: params.id,
      copies: parsed.data?.copies,
    });
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    if (e instanceof NoReceiptPrinterError) return jsonError('NO_PRINTER', 409);
    if (e instanceof CreditNoteNotFoundError) return jsonError('NOT_FOUND', 404);
    throw e;
  }
}
