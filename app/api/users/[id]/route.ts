import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { hashPassword } from '@/lib/auth/password';
import { audit } from '@/lib/audit/log';

const ROLES = ['super_admin','owner','manager','vendeur','comptable','lecture_seule','support_technique'] as const;

const patch = z.object({
  full_name: z.string().min(1).max(120).optional(),
  email: z.string().email().max(160).optional(),
  role: z.enum(ROLES).optional(),
  pin: z.string().regex(/^\d{4}$/).optional(),
  password: z.string().min(8).max(120).optional(),
  pin_required: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('users.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, patch);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (d.full_name !== undefined) { sets.push(`full_name = $${i++}`); vals.push(d.full_name.trim()); }
  if (d.email !== undefined) { sets.push(`email = $${i++}`); vals.push(d.email.toLowerCase()); }
  if (d.role !== undefined) { sets.push(`role = $${i++}`); vals.push(d.role); }
  if (d.is_active !== undefined) { sets.push(`is_active = $${i++}`); vals.push(d.is_active); }
  if (d.pin_required !== undefined) { sets.push(`pin_required = $${i++}`); vals.push(d.pin_required); }
  if (d.pin !== undefined) {
    const h = await hashPassword(d.pin);
    sets.push(`pin_code_hash = $${i++}`); vals.push(h);
    // ⚠ ne touche PLUS au password_hash : le mot de passe est géré
    // indépendamment via le champ "password" pour ne pas écraser un
    // vrai mot de passe sécurisé par un hash du PIN (4 chiffres).
  }
  if (d.password !== undefined) {
    const h = await hashPassword(d.password);
    sets.push(`password_hash = $${i++}`); vals.push(h);
  }
  if (sets.length === 0) return NextResponse.json({ ok: true });
  sets.push('updated_at = now()');
  vals.push(params.id, g.user.organizationId);

  const res = await query(
    `UPDATE users SET ${sets.join(', ')}
      WHERE id = $${i++} AND organization_id = $${i}`,
    vals,
  );
  if (res.rowCount === 0) return jsonError('NOT_FOUND', 404);

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'users.update', entityType: 'user', entityId: params.id,
    payload: Object.keys(d).reduce((acc, k) => ({
      ...acc,
      [k]: (k === 'pin' || k === 'password') ? '****' : (d as Record<string, unknown>)[k],
    }), {}),
  });
  return NextResponse.json({ ok: true });
}
