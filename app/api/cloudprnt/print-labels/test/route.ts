import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { query } from '@/lib/db/client';
import { mergeLabelDefaults, LABEL_KEY } from '@/lib/settings/label';
import {
  buildTestLabelsStarPrnt, buildComparatifStarPrnt, buildTestTopOfFormStarPrnt,
  dernierMoteurJob, STARPRNT_CONTENT_TYPE,
} from '@/lib/services/cloudprnt/starprnt';
import { resolveLabelPrinter, enqueueJob } from '@/lib/services/cloudprnt/queue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  count: z.number().int().min(1).max(20).optional(),
  /** Comparatif : quatre enchaînements, deux étiquettes chacun, marqués A à D. */
  comparatif: z.boolean().optional(),
  /** Essai « top-of-form » : avance sur la marque AVANT chaque image. */
  experience: z.boolean().optional(),
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

  const compte = parsed.data.count ?? 1;
  let payload: Buffer;
  try {
    payload = parsed.data.comparatif ? await buildComparatifStarPrnt(settings)
      : parsed.data.experience ? await buildTestTopOfFormStarPrnt(compte, settings)
      : await buildTestLabelsStarPrnt(compte, settings);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[print-labels/test] fabrication du job', err);
    return NextResponse.json(
      { error: 'BUILD_FAILED', message: (err as Error).message ?? 'Fabrication impossible.' },
      { status: 500 },
    );
  }

  const job = await enqueueJob({
    organizationId: g.user.organizationId,
    printerId: printer.id,
    contentType: STARPRNT_CONTENT_TYPE,
    payload,
    title: parsed.data.comparatif ? 'Réglage — comparatif des enchaînements'
      : parsed.data.experience ? `Essai top-of-form — ${compte} étiquette${compte > 1 ? 's' : ''}`
      : `Réglage — ${compte} étiquette${compte > 1 ? 's' : ''}`,
    userId: g.user.id,
  });

  return NextResponse.json({
    ok: true, job_id: job.id, printer: printer.label, count: parsed.data.comparatif ? 8 : compte,
    ...dernierMoteurJob(),
  });
}
