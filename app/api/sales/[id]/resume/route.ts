import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { query } from '@/lib/db/client';
import { CashSessionService } from '@/lib/services/cash-session-service';
import { isSharedFloat } from '@/lib/settings/cash-server';

const schema = z.object({ register_id: z.string().uuid() });

/**
 * Reprend un ticket en attente sur la caisse COURANTE.
 *
 * Les tickets en attente sont partagés par toute la boutique : on peut donc
 * en démarrer un sur une caisse et le reprendre sur une autre — mais
 * UNIQUEMENT dans la même boutique. À la reprise, on réaffecte la vente à la
 * caisse (register) + la session de caisse ouverte du poste courant, pour que
 * l'encaissement (et le tiroir) soit correctement rattaché à la caisse qui
 * finalise. Le statut repasse à « draft » (ticket actif → sort de la liste
 * des en-attente, évitant qu'une autre caisse le reprenne en parallèle).
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const org = g.user.organizationId;
  const registerId = parsed.data.register_id;

  const reg = await query<{ store_id: string }>(
    `SELECT store_id FROM registers WHERE id = $1 AND organization_id = $2`,
    [registerId, org],
  );
  if (reg.rowCount === 0) return jsonError('REGISTER_NOT_FOUND', 404);
  const registerStore = reg.rows[0]!.store_id;

  const sale = await query<{ store_id: string; status: string }>(
    `SELECT store_id, status FROM sales WHERE id = $1 AND organization_id = $2`,
    [params.id, org],
  );
  if (sale.rowCount === 0) return jsonError('SALE_NOT_FOUND', 404);
  if (sale.rows[0]!.status !== 'on_hold' && sale.rows[0]!.status !== 'draft') {
    return jsonError('SALE_NOT_RESUMABLE', 409);
  }
  // Isolation boutique : on ne reprend un ticket QUE dans sa boutique.
  if (sale.rows[0]!.store_id !== registerStore) return jsonError('CROSS_STORE_FORBIDDEN', 403);

  // Session de caisse ouverte qui fait foi pour ce poste. En fonds commun,
  // c'est la session de la BOUTIQUE (le poste courant a pu rejoindre le fonds
  // d'un autre poste) : la résoudre par register_id seul rattacherait le ticket
  // à « aucune » session, et l'encaissement échouerait ensuite.
  const shared = await isSharedFloat(org, registerStore);
  const sessionId = await CashSessionService.resolveOpenSessionId({
    storeId: registerStore,
    registerId,
    shared,
  });

  await query(
    `UPDATE sales
        SET register_id = $1,
            cash_session_id = COALESCE($2, cash_session_id),
            user_id = $5,
            status = 'draft',
            updated_at = now()
      WHERE id = $3 AND organization_id = $4`,
    [registerId, sessionId, params.id, org, g.user.id],
  );
  return NextResponse.json({ ok: true });
}
