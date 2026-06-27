import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withTransaction } from '@/lib/db/client';
import { hashPassword } from '@/lib/auth/password';
import { parseJson, jsonError } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

/**
 * Endpoint d'amorçage : crée le premier super_admin SaaS de la plateforme.
 *
 * - Refuse si un super_admin existe déjà → l'endpoint s'auto-désactive
 *   une fois le premier compte créé. Pour ajouter d'autres super_admin,
 *   passer par /admin ou le script create:super-admin.
 * - Requiert un secret partagé (env INIT_SECRET) pour bloquer
 *   l'utilisation par n'importe qui qui devine l'URL.
 * - Crée une organisation "système" si nécessaire, puis le user
 *   super_admin rattaché.
 */
const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(2).max(120),
  init_secret: z.string().min(1),
});

export async function POST(req: Request) {
  const parsed = await parseJson(req, bodySchema);
  if ('response' in parsed) return parsed.response;
  const { email, password, full_name, init_secret } = parsed.data;

  const expected = process.env.INIT_SECRET;
  if (!expected) {
    return jsonError('INIT_SECRET_NOT_CONFIGURED', 503, {
      message:
        "Configurez la variable d'environnement INIT_SECRET sur Vercel " +
        '(une chaîne aléatoire de 32+ caractères) puis redéployez.',
    });
  }
  if (init_secret !== expected) {
    return jsonError('INVALID_INIT_SECRET', 403);
  }

  try {
    const result = await withTransaction(async (client) => {
      // Refuse si un super_admin existe déjà
      const existing = await client.query(
        `SELECT 1 FROM users WHERE role = 'super_admin' LIMIT 1`,
      );
      if (existing.rowCount && existing.rowCount > 0) {
        throw Object.assign(new Error('SUPER_ADMIN_ALREADY_EXISTS'), {
          status: 409,
        });
      }

      // Crée (ou réutilise) une orga "Webpos système"
      let orgRes = await client.query<{ id: string }>(
        `SELECT id FROM organizations WHERE slug = 'webpos-system' LIMIT 1`,
      );
      let orgId: string;
      if (orgRes.rowCount === 0) {
        const ins = await client.query<{ id: string }>(
          `INSERT INTO organizations
             (name, legal_name, slug, plan, max_devices)
           VALUES ('Webpos système', 'Webpos système', 'webpos-system',
                   'enterprise', 50)
           RETURNING id`,
        );
        orgId = ins.rows[0]!.id;
      } else {
        orgId = orgRes.rows[0]!.id;
      }

      // Crée l'utilisateur super_admin
      const hash = await hashPassword(password);
      const userIns = await client.query<{ id: string }>(
        `INSERT INTO users
           (organization_id, email, full_name, password_hash,
            role, is_active)
         VALUES ($1, lower($2), $3, $4, 'super_admin', TRUE)
         RETURNING id`,
        [orgId, email, full_name, hash],
      );

      return { id: userIns.rows[0]!.id, email: email.toLowerCase(), orgId };
    });

    return NextResponse.json({
      ok: true,
      user_id: result.id,
      email: result.email,
      message:
        'Compte super_admin créé. Va sur /login → "Accès admin et autres" pour te connecter.',
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    if (status === 409) {
      return jsonError('SUPER_ADMIN_ALREADY_EXISTS', 409, {
        message:
          'Un super_admin existe déjà. Connecte-toi avec ce compte, ou utilise ' +
          '/admin pour gérer les comptes existants.',
      });
    }
    // eslint-disable-next-line no-console
    console.error('[init-super-admin]', err);
    return jsonError('INTERNAL_ERROR', 500, {
      message: (err as Error).message,
    });
  }
}
