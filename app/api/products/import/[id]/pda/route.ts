import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

const schema = z.object({ sent_to_pda: z.boolean() });

/**
 * Bascule « Envoyer cet import au PDA » (fin d'import, Produits → Importer).
 * Seuls les lots avec sent_to_pda = TRUE sont visibles dans « Réception
 * d'import » sur le PDA (voir /api/pda/import-batches).
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('products.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  const existing = await query(
    `SELECT 1 FROM import_batches WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (existing.rowCount === 0) return jsonError('NOT_FOUND', 404);

  await query(
    `UPDATE import_batches SET sent_to_pda = $1 WHERE id = $2 AND organization_id = $3`,
    [parsed.data.sent_to_pda, params.id, g.user.organizationId],
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'products.import.pda',
    entityType: 'import_batch', entityId: params.id,
    payload: { sent_to_pda: parsed.data.sent_to_pda },
  });

  return NextResponse.json({ ok: true, sent_to_pda: parsed.data.sent_to_pda });
}
