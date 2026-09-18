import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { normalizeWeights } from '@/lib/analytics/objectives';
import { saveSchedule } from '@/lib/analytics/objectives-server';

export const dynamic = 'force-dynamic';

const schema = z.object({
  store_id: z.string().uuid(),
  weights: z.array(z.number().min(0).max(1000)).length(7),
});

/** Enregistre la semaine-type (poids par jour, 0 = fermé) d'une boutique. */
export async function PUT(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;

  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { store_id, weights } = parsed.data;

  const own = await query(
    `SELECT 1 FROM stores WHERE id = $1 AND organization_id = $2`,
    [store_id, g.user.organizationId],
  );
  if (own.rowCount === 0) return jsonError('STORE_NOT_FOUND', 404);

  await saveSchedule(g.user.organizationId, store_id, normalizeWeights(weights), g.user.id);
  return NextResponse.json({ ok: true });
}
