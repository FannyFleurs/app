import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

const STATUSES = ['confirmed','in_preparation','ready','delivered','cancelled'] as const;

const schema = z.object({
  prep_status: z.enum(STATUSES),
});

/**
 * Met à jour le statut de préparation d'une vente caisse marquée
 * "retrait" ou "livraison" via OrderModal. Le statut fiscal de la
 * vente (sales.status='validated') reste inchangé — on ne touche que
 * sales.prep_status.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  try {
    const res = await query(
      `UPDATE sales
          SET prep_status = $1,
              updated_at = now()
        WHERE id = $2 AND organization_id = $3`,
      [parsed.data.prep_status, params.id, g.user.organizationId],
    );
    if (res.rowCount === 0) return jsonError('NOT_FOUND', 404);
  } catch (err) {
    const msg = (err as Error).message || '';
    if (msg.includes('prep_status')) {
      return jsonError('MIGRATION_MISSING', 503, {
        message: 'Migration 0021 non appliquée. Lancez npm run db:migrate.',
      });
    }
    return jsonError('INTERNAL_ERROR', 500, { message: msg });
  }

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'sales.prep_status.update',
    entityType: 'sale', entityId: params.id,
    payload: parsed.data,
  });
  return NextResponse.json({ ok: true });
}
