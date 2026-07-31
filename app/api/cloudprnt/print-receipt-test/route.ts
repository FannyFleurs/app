import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { query } from '@/lib/db/client';
import { resolveReceiptPrinter, enqueueJob, type CloudPrntPrinter } from '@/lib/services/cloudprnt/queue';
import { buildTestReceiptStarPrnt, STARPRNT_CONTENT_TYPE } from '@/lib/services/cloudprnt/receipt-star';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  printer_id: z.string().uuid().optional(),
  store_id: z.string().uuid().nullable().optional(),
  shop_name: z.string().max(120).optional(),
});

/**
 * Met en file un ticket de test (+ ouverture tiroir) sur l'imprimante TICKET
 * CloudPRNT. Sert à valider la configuration depuis la page de réglages.
 */
export async function POST(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  let printer: CloudPrntPrinter | null = null;
  if (parsed.data.printer_id) {
    const { rows } = await query<CloudPrntPrinter>(
      `SELECT id, organization_id, store_id, mac, label, role, poll_token, enabled
         FROM cloudprnt_printers
        WHERE id = $1 AND organization_id = $2 AND role = 'receipt'`,
      [parsed.data.printer_id, g.user.organizationId],
    );
    printer = rows[0] ?? null;
  } else {
    printer = await resolveReceiptPrinter(g.user.organizationId, parsed.data.store_id ?? null);
  }
  if (!printer) return NextResponse.json({ error: 'NO_PRINTER' }, { status: 409 });

  const payload = await buildTestReceiptStarPrnt(parsed.data.shop_name ?? null);
  await enqueueJob({
    organizationId: g.user.organizationId,
    printerId: printer.id,
    contentType: STARPRNT_CONTENT_TYPE,
    payload,
    title: 'Ticket de test',
    userId: g.user.id,
  });
  return NextResponse.json({ ok: true });
}
