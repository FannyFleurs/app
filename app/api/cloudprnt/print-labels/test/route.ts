import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { query } from '@/lib/db/client';
import { mergeLabelDefaults, LABEL_KEY } from '@/lib/settings/label';
import { buildTestLabelsStarPrnt, dernierMoteurJob, STARPRNT_CONTENT_TYPE } from '@/lib/services/cloudprnt/starprnt';
import { resolveLabelPrinter, enqueueJob } from '@/lib/services/cloudprnt/queue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  count: z.number().int().min(1).max(20),
  store_id: z.string().uuid().nullable().optional(),
});

/**
 * Lot de RÉGLAGE : des étiquettes numérotées « TEST 01 », « TEST 02 »…, un
 * filet en haut, un filet en bas, rien d'autre.
 *
 * On en tire 1, puis 2, 5, 10, 20, et on ne regarde qu'une chose : la position
 * du contenu sur la dernière comparée à la première. Identique = le pas est
 * juste. Décalage qui grandit d'étiquette en étiquette = le pas est encore
 * fabriqué quelque part.
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

  const payload = await buildTestLabelsStarPrnt(parsed.data.count, settings);

  const job = await enqueueJob({
    organizationId: g.user.organizationId,
    printerId: printer.id,
    contentType: STARPRNT_CONTENT_TYPE,
    payload,
    title: `Réglage — ${parsed.data.count} étiquette${parsed.data.count > 1 ? 's' : ''}`,
    userId: g.user.id,
  });

  return NextResponse.json({
    ok: true, job_id: job.id, printer: printer.label, count: parsed.data.count,
    ...dernierMoteurJob(),
  });
}
