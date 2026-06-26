import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

const schema = z.object({
  register_id: z.string().uuid(),
  movement_type: z.enum(['in', 'out']),
  amount: z.number().positive(),
  reason: z.string().min(1).max(200),
});

/**
 * Mouvement de caisse (entrée ou sortie d'espèces hors vente).
 * Cas typiques : remise en banque (out), fond de réserve apporté (in),
 * paiement fournisseur en espèces (out), etc.
 *
 * Écrit dans cash_movements (append-only), associé à la session ouverte.
 */
export async function POST(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { register_id, movement_type, amount, reason } = parsed.data;

  // Trouve la session ouverte sur cette caisse
  const session = await query<{ id: string; store_id: string }>(
    `SELECT id, store_id FROM cash_sessions
      WHERE register_id = $1 AND organization_id = $2 AND status = 'open'
      ORDER BY opened_at DESC LIMIT 1`,
    [register_id, g.user.organizationId],
  );
  if (session.rowCount === 0) return jsonError('NO_OPEN_SESSION', 400);
  const s = session.rows[0]!;

  const ins = await query<{ id: string }>(
    `INSERT INTO cash_movements
       (organization_id, cash_session_id, movement_type, amount, reason, user_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [g.user.organizationId, s.id, movement_type, amount, reason, g.user.id],
  );

  await audit({
    organizationId: g.user.organizationId,
    userId: g.user.id,
    action: `cash_movement.${movement_type}`,
    entityType: 'cash_session',
    entityId: s.id,
    payload: { amount, reason, register_id },
  });

  return NextResponse.json({ ok: true, id: ins.rows[0]!.id });
}

/**
 * Liste les mouvements d'une session ouverte pour la caisse donnée
 * (ou de la session passée par session_id).
 */
export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  const registerId = url.searchParams.get('register_id');
  const sessionIdParam = url.searchParams.get('session_id');

  let sessionId = sessionIdParam;
  if (!sessionId && registerId) {
    const session = await query<{ id: string }>(
      `SELECT id FROM cash_sessions
        WHERE register_id = $1 AND organization_id = $2 AND status = 'open'
        ORDER BY opened_at DESC LIMIT 1`,
      [registerId, g.user.organizationId],
    );
    sessionId = session.rows[0]?.id ?? null;
  }
  if (!sessionId) return NextResponse.json({ movements: [] });

  const { rows } = await query(
    `SELECT id, movement_type, amount::text, reason, created_at
       FROM cash_movements
      WHERE cash_session_id = $1 AND organization_id = $2
      ORDER BY created_at DESC LIMIT 200`,
    [sessionId, g.user.organizationId],
  );
  return NextResponse.json({ movements: rows });
}
