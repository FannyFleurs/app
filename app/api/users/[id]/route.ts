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
  // Email facultatif : '' vide autorisé pour effacer (vendeur PIN seul).
  email: z.string().email().max(160).optional().or(z.literal('')),
  role: z.enum(ROLES).optional(),
  pin: z.string().regex(/^\d{4}$/).optional(),
  password: z.string().min(8).max(120).optional(),
  pin_required: z.boolean().optional(),
  is_active: z.boolean().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  /** Remplace la liste des boutiques auxquelles l'utilisateur a accès. */
  store_ids: z.array(z.string().uuid()).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('users.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, patch);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  // Sécurité : seul un super_admin peut attribuer un rôle plateforme.
  if ((d.role === 'super_admin' || d.role === 'support_technique') && g.user.role !== 'super_admin') {
    return jsonError('FORBIDDEN_ROLE', 403);
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (d.full_name !== undefined) { sets.push(`full_name = $${i++}`); vals.push(d.full_name.trim()); }
  if (d.email !== undefined) { sets.push(`email = $${i++}`); vals.push(d.email.trim() ? d.email.trim().toLowerCase() : null); }
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
  // color est UPDATE separement plus bas (silencieux si migration 0022 absente).
  if (sets.length === 0 && d.color === undefined && d.store_ids === undefined) {
    return NextResponse.json({ ok: true });
  }

  if (sets.length > 0) {
    sets.push('updated_at = now()');
    vals.push(params.id, g.user.organizationId);
    const res = await query(
      `UPDATE users SET ${sets.join(', ')}
        WHERE id = $${i++} AND organization_id = $${i}`,
      vals,
    );
    if (res.rowCount === 0) return jsonError('NOT_FOUND', 404);
  }

  if (d.color !== undefined) {
    try {
      await query(
        `UPDATE users SET color = $1, updated_at = now()
          WHERE id = $2 AND organization_id = $3`,
        [d.color === null ? null : d.color.toUpperCase(), params.id, g.user.organizationId],
      );
    } catch (err) {
      const m = (err as Error).message ?? '';
      // Migration 0022 pas appliquee : on ignore silencieusement le color.
      if (!(m.includes('column "color"') || m.includes('"users".color'))) throw err;
    }
  }

  // Rattachement aux boutiques : on remplace integralement les lignes
  // user_store_access par la nouvelle liste (verifiee cote org).
  if (d.store_ids !== undefined) {
    // Verifie que l'utilisateur cible appartient bien a l'org.
    const owns = await query(
      `SELECT 1 FROM users WHERE id = $1 AND organization_id = $2`,
      [params.id, g.user.organizationId],
    );
    if (owns.rowCount === 0) return jsonError('NOT_FOUND', 404);

    await query(`DELETE FROM user_store_access WHERE user_id = $1`, [params.id]);
    if (d.store_ids.length > 0) {
      await query(
        `INSERT INTO user_store_access (user_id, store_id)
           SELECT $1, id FROM stores
            WHERE organization_id = $2 AND id = ANY($3::uuid[])
         ON CONFLICT DO NOTHING`,
        [params.id, g.user.organizationId, d.store_ids],
      );
    }
  }

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
