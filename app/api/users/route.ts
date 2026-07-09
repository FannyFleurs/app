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
  // Email facultatif : un vendeur caisse se connecte par PIN seul.
  email: z.string().email().max(160).optional().or(z.literal('')),
  role: z.enum(ROLES),
  pin: z.string().regex(/^\d{4}$/, 'PIN doit être 4 chiffres').optional(),
  password: z.string().min(8).max(120).optional(),
  pin_required: z.boolean().optional(),
  is_active: z.boolean().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur invalide').nullable().optional(),
  /**
   * Boutiques auxquelles l'utilisateur est rattaché. Si omis à la
   * création, on rattache à TOUTES les boutiques (compat mono-boutique).
   * Si fourni (même vide), on applique exactement cette liste.
   */
  store_ids: z.array(z.string().uuid()).optional(),
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

  // Rattachement aux boutiques (user_store_access) agrege par user.
  const accessRes = await query<{ user_id: string; store_id: string }>(
    `SELECT usa.user_id, usa.store_id
       FROM user_store_access usa
       JOIN users u ON u.id = usa.user_id
      WHERE u.organization_id = $1`,
    [g.user.organizationId],
  );
  const storeMap = new Map<string, string[]>();
  for (const a of accessRes.rows) {
    const arr = storeMap.get(a.user_id) ?? [];
    arr.push(a.store_id);
    storeMap.set(a.user_id, arr);
  }

  // Ajoute la colonne color a la reponse (silencieux si migration 0022 absente).
  try {
    const colorRes = await query<{ id: string; color: string | null }>(
      `SELECT id, color FROM users WHERE organization_id = $1`,
      [g.user.organizationId],
    );
    const colorMap = new Map(colorRes.rows.map((r) => [r.id, r.color]));
    return NextResponse.json({
      users: rows.map((u) => ({
        ...u,
        color: colorMap.get(u.id) ?? null,
        store_ids: storeMap.get(u.id) ?? [],
      })),
    });
  } catch {
    return NextResponse.json({
      users: rows.map((u) => ({ ...u, store_ids: storeMap.get(u.id) ?? [] })),
    });
  }
}

export async function POST(req: Request) {
  const g = await requirePermission('users.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  // Email facultatif (vendeur PIN). Normalisé, null si absent.
  const email = d.email && d.email.trim() ? d.email.trim().toLowerCase() : null;

  try {
    // Vérifie l'unicité de l'email seulement s'il est fourni.
    if (email) {
      const exists = await query(
        `SELECT 1 FROM users WHERE organization_id = $1 AND lower(email) = $2`,
        [g.user.organizationId, email],
      );
      if (exists.rowCount && exists.rowCount > 0) return jsonError('EMAIL_ALREADY_EXISTS', 409);
    }

    const pinHash = d.pin ? await hashPassword(d.pin) : null;
    // Mot de passe applicatif (NOT NULL) :
    //   password fourni → hash du password (recommandé)
    //   sinon hash du PIN si fourni
    //   sinon hash aléatoire (compte non connectable par email/password
    //   tant qu'on n'aura pas reset, mais le PIN suffira pour la caisse)
    const passwordHash = d.password
      ? await hashPassword(d.password)
      : (pinHash ?? await hashPassword(crypto.randomUUID()));

    const ins = await query<{ id: string }>(
      `INSERT INTO users
         (organization_id, email, password_hash, full_name, role, is_active,
          pin_code_hash, pin_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        g.user.organizationId, email, passwordHash, d.full_name.trim(),
        d.role, d.is_active ?? true, pinHash, d.pin_required ?? true,
      ],
    );
    const newUserId = ins.rows[0]!.id;

    // Couleur d'etiquette (silencieux si migration 0022 absente).
    if (d.color) {
      try {
        await query(
          `UPDATE users SET color = $1 WHERE id = $2 AND organization_id = $3`,
          [d.color.toUpperCase(), newUserId, g.user.organizationId],
        );
      } catch { /* ignore */ }
    }

    // Rattachement aux boutiques :
    //   - store_ids fourni : on rattache exactement a ces boutiques
    //     (apres verification qu'elles appartiennent bien a l'org).
    //   - store_ids omis : compat mono-boutique, on rattache a TOUTES
    //     les boutiques actives (sinon un vendeur tombe sur "Caisse non
    //     configuree" au 1er login).
    if (d.store_ids !== undefined) {
      if (d.store_ids.length > 0) {
        await query(
          `INSERT INTO user_store_access (user_id, store_id)
             SELECT $1, id FROM stores
              WHERE organization_id = $2 AND id = ANY($3::uuid[])
           ON CONFLICT DO NOTHING`,
          [newUserId, g.user.organizationId, d.store_ids],
        );
      }
    } else {
      await query(
        `INSERT INTO user_store_access (user_id, store_id)
           SELECT $1, id FROM stores
            WHERE organization_id = $2 AND is_active = TRUE
         ON CONFLICT DO NOTHING`,
        [newUserId, g.user.organizationId],
      );
    }

    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'users.create', entityType: 'user', entityId: newUserId,
      payload: { full_name: d.full_name, role: d.role },
    });
    return NextResponse.json({ id: newUserId }, { status: 201 });
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
