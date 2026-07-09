import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { hashPassword } from '@/lib/auth/password';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

const schema = z.object({ password: z.string().min(8).max(120) });

/** Réinitialise le mot de passe d'un utilisateur (super-admin). */
export async function POST(req: Request, { params }: { params: { id: string; uid: string } }) {
  const g = await requireSuperAdmin();
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  const hash = await hashPassword(parsed.data.password.trim());
  // Reset COMPLET : nouveau mot de passe + on lève le verrouillage
  // (failed_attempts / locked_until) et on réactive le compte. Sinon un
  // compte verrouillé par des tentatives ratées reste inaccessible même
  // avec le bon mot de passe.
  const r = await query(
    `UPDATE users
        SET password_hash = $1, failed_attempts = 0, locked_until = NULL,
            is_active = TRUE, updated_at = now()
      WHERE id = $2 AND organization_id = $3`,
    [hash, params.uid, params.id],
  );
  if (r.rowCount === 0) return jsonError('NOT_FOUND', 404);

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'admin.user.reset_password',
    entityType: 'user', entityId: params.uid,
    payload: { target_org: params.id },
  });
  return NextResponse.json({ ok: true });
}
