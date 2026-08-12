import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

const bodySchema = z.object({ archived: z.boolean() });

/**
 * Range une fiche client, ou la remet en service.
 *
 * Rien n'est effacé : les tickets, factures et avoirs du client restent
 * rattachés à cette fiche, comme l'exige l'historique fiscal. Seule la
 * visibilité change — la fiche cesse de remonter dans les recherches, en
 * caisse comme au back-office. C'est le geste qui manquait face aux doublons :
 * on garde celui qui porte l'historique, on range l'autre.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('customers.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, bodySchema);
  if ('response' in parsed) return parsed.response;
  const { archived } = parsed.data;

  const res = await query(
    `UPDATE customers
        SET archived_at = ${archived ? 'now()' : 'NULL'},
            updated_by = $3, updated_at = now()
      WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId, g.user.id],
  );
  if (res.rowCount === 0) return jsonError('NOT_FOUND', 404);

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: archived ? 'customers.archive' : 'customers.unarchive',
    entityType: 'customer', entityId: params.id,
    payload: {},
  });
  return NextResponse.json({ archived });
}
