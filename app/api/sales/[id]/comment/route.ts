import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { query } from '@/lib/db/client';

const schema = z.object({ comment: z.string().max(1000).nullable() });

/**
 * Enregistre le commentaire libre d'un ticket (stocké dans sales.notes).
 * Repris dans le snapshot à la validation → imprimé sur le ticket, et copié
 * sur la facture le cas échéant.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  const comment = parsed.data.comment?.trim() || null;
  const res = await query(
    `UPDATE sales SET notes = $3, updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND status IN ('draft','on_hold')`,
    [params.id, g.user.organizationId, comment],
  );
  if (res.rowCount === 0) return jsonError('NOT_FOUND', 404);
  return NextResponse.json({ ok: true });
}
