import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

const schema = z.object({
  notes: z.string().max(2000),
});

/**
 * Modifie le commentaire d'une vente déjà validée (ex. numéro de dossier
 * OGF oublié ou mal saisi à la commande, à corriger après coup). Le trigger
 * fn_protect_validated_sale ne gèle que les champs fiscaux (totaux, numéro
 * de ticket, hash, date de validation) — `notes` reste modifiable.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const notes = parsed.data.notes.trim() || null;

  const res = await query(
    `UPDATE sales SET notes = $1, updated_at = now() WHERE id = $2 AND organization_id = $3`,
    [notes, params.id, g.user.organizationId],
  );
  if (res.rowCount === 0) return jsonError('SALE_NOT_FOUND', 404);

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'sales.notes_update', entityType: 'sale', entityId: params.id,
    payload: { notes },
  });

  return NextResponse.json({ ok: true, notes });
}
