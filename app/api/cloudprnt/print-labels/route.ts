import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { query } from '@/lib/db/client';
import { mergeLabelDefaults, LABEL_KEY } from '@/lib/settings/label';
import { buildLabelsStarPrnt, countLabels, dernierMoteurJob, STARPRNT_CONTENT_TYPE } from '@/lib/services/cloudprnt/starprnt';
import { resolveLabelPrinter, enqueueJob } from '@/lib/services/cloudprnt/queue';
import type { LabelProduct } from '@/lib/services/label-print';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const productSchema = z.object({
  name: z.string(),
  sku: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  sale_price_ttc: z.number(),
  discount_type: z.enum(['percent', 'amount']).nullable().optional(),
  discount_value: z.number().nullable().optional(),
});

const schema = z.object({
  entries: z.array(z.object({ product: productSchema, qty: z.number().int().min(1).max(200) })).min(1),
  store_id: z.string().uuid().nullable().optional(),
});

/**
 * Met en file un job d'impression d'étiquettes pour l'imprimante CloudPRNT
 * (mC-Label3). L'imprimante récupérera le job à son prochain sondage.
 */
export async function POST(req: Request) {
  const g = await requirePermission('products.read');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  const printer = await resolveLabelPrinter(g.user.organizationId, parsed.data.store_id ?? null);
  if (!printer) return NextResponse.json({ error: 'NO_PRINTER' }, { status: 409 });

  const st = await query<{ value: unknown }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [g.user.organizationId, LABEL_KEY],
  );
  const settings = mergeLabelDefaults((st.rows[0]?.value as Record<string, unknown>) ?? null);

  const entries = parsed.data.entries.map((e) => ({ product: e.product as LabelProduct, qty: e.qty }));
  const payload = await buildLabelsStarPrnt(entries, settings);
  const count = countLabels(entries);

  const job = await enqueueJob({
    organizationId: g.user.organizationId,
    printerId: printer.id,
    contentType: STARPRNT_CONTENT_TYPE,
    payload,
    title: `${count} étiquette${count > 1 ? 's' : ''}`,
    userId: g.user.id,
  });

  return NextResponse.json({
    ok: true, job_id: job.id, printer: printer.label, count, ...dernierMoteurJob(),
  });
}
