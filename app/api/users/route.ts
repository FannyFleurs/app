import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { hashPassword } from '@/lib/auth/password';
import { audit } from '@/lib/audit/log';

const ROLES = ['super_admin','owner','manager','vendeur','comptable','lecture_seule','support_technique'] as const;

const schema = z.object({
  full_name: z.string().min(1).max(120),
  email: z.string().email().max(160),
  role: z.enum(ROLES),
  pin: z.string().regex(/^\d{4}$/, 'PIN doit être 4 chiffres').optional(),
  pin_required: z.boolean().optional(),
  is_active: z.boolean().optional(),
}).refine(
  (d) => d.pin_required === false || !!d.pin,
  { message: 'PIN obligatoire quand pin_required est activé', path: ['pin'] },
);

export async function GET() {
  const g = await requirePermission('users.read');
  if ('response' in g) return g.response;
  const { rows } = await query<{
    id: string; email: string; full_name: string; role: string;
    is_active: boolean; has_pin: boolean; pin_required: boolean;
    last_login_at: string | null;
  }>(
    `SELECT id, email, full_name, role, is_active,
            (pin_code_hash IS NOT NULL) AS has_pin,
            COALESCE(pin_required, TRUE) AS pin_required,
            last_login_at
       FROM users WHERE organization_id = $1
       ORDER BY full_name`,
    [g.user.organizationId],
  );
  return NextResponse.json({ users: rows });
}

export async function POST(req: Request) {
  const g = await requirePermission('users.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  try {
    // Vérifie unicité email dans l'organisation
    const exists = await query(
      `SELECT 1 FROM users WHERE organization_id = $1 AND email = $2`,
      [g.user.organizationId, d.email],
    );
    if (exists.rowCount && exists.rowCount > 0) return jsonError('EMAIL_ALREADY_EXISTS', 409);

    const pinHash = d.pin ? await hashPassword(d.pin) : null;
    // Mot de passe applicatif (NOT NULL) : hash du PIN, sinon hash aléatoire
    const passwordHash = pinHash ?? await hashPassword(crypto.randomUUID());

    const ins = await query<{ id: string }>(
      `INSERT INTO users
         (organization_id, email, password_hash, full_name, role, is_active,
          pin_code_hash, pin_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        g.user.organizationId, d.email.toLowerCase(), passwordHash, d.full_name.trim(),
        d.role, d.is_active ?? true, pinHash, d.pin_required ?? true,
      ],
    );

    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'users.create', entityType: 'user', entityId: ins.rows[0]!.id,
      payload: { full_name: d.full_name, role: d.role },
    });
    return NextResponse.json({ id: ins.rows[0]!.id }, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[users.create]', err);
    const m = (err as Error).message ?? '';
    const hint = m.includes('pin_code_hash')
      ? 'Migration manquante : exécutez `npm run db:migrate` (0007_user_pin_and_settings.sql).'
      : m;
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: hint }, { status: 500 });
  }
}
