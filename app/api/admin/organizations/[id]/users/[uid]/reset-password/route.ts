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

  const hash = await hashPassword(parsed.data.password);
  const r = await query(
    `UPDATE users SET password_hash = $1, updated_at = now()
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
