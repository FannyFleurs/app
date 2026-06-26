import { NextResponse } from 'next/server';
import { z } from 'zod';
import { cookies, headers } from 'next/headers';
import { withTransaction } from '@/lib/db/client';
import { hashPassword } from '@/lib/auth/password';
import { createSession, sessionCookieOptions } from '@/lib/auth/session';
import { setTenantCookie } from '@/lib/auth/tenant';
import { jsonError } from '@/lib/validation/api';
import { parseJson } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

/**
 * Setup multi-tenant SaaS : chaque appel crée une NOUVELLE organisation.
 * Aucune limite globale — n'importe qui peut s'inscrire et créer son
 * propre tenant. Seul le couple (email administrateur) doit être unique
 * dans toute la base.
 *
 * À la fin, l'administrateur est :
 *   - inséré comme `owner` de la nouvelle organisation,
 *   - automatiquement connecté (session JWT + cookie tenant),
 *   - placé en plan `trial` (14 jours).
 */
const schema = z.object({
  company: z.object({
    name: z.string().min(1).max(120),
    legal_name: z.string().min(1).max(160),
    siret: z.string().max(40).optional(),
    vat_number: z.string().max(40).optional(),
    address_line1: z.string().max(160).optional(),
    address_zip: z.string().max(20).optional(),
    address_city: z.string().max(120).optional(),
    phone: z.string().max(40).optional(),
    email: z.string().email().max(160).optional(),
  }),
  store: z.object({
    code: z.string().min(1).max(40),
    name: z.string().min(1).max(120),
  }),
  register: z.object({
    code: z.string().min(1).max(40),
    name: z.string().min(1).max(120),
  }),
  admin: z.object({
    email: z.string().email().max(160),
    full_name: z.string().min(1).max(120),
    pin: z.string().regex(/^\d{4}$/),
    password: z.string().min(8).max(120).optional(),
  }),
  tax_rates: z.array(z.object({
    code: z.string().min(1).max(40),
    label: z.string().min(1).max(120),
    rate: z.number().min(0).max(100),
    is_default: z.boolean().optional(),
  })).min(1).max(10),
});

const TRIAL_DAYS = 14;

function slugify(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 60);
}

export async function POST(req: Request) {
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  const ua = headers().get('user-agent');
  const ip = headers().get('x-forwarded-for')?.split(',')[0]?.trim()
          || headers().get('x-real-ip')
          || null;

  try {
    const created = await withTransaction(async (client) => {
      // 1. Unicité de l'email admin (globalement, multi-tenant)
      const dup = await client.query(
        `SELECT 1 FROM users WHERE lower(email) = lower($1)`,
        [d.admin.email],
      );
      if (dup.rowCount && dup.rowCount > 0) {
        throw new Error('EMAIL_ALREADY_TAKEN');
      }

      // 2. Slug unique (suffixe -2, -3… en cas de collision)
      const base = slugify(d.company.name) || 'florea';
      let slug = base;
      for (let i = 2; i < 100; i++) {
        const r = await client.query(`SELECT 1 FROM organizations WHERE slug = $1`, [slug]);
        if (r.rowCount === 0) break;
        slug = `${base}-${i}`;
      }

      // 3. Organisation
      const orgIns = await client.query<{ id: string }>(
        `INSERT INTO organizations
           (name, legal_name, slug, siret, vat_number, address, contact, plan, trial_ends_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'trial', now() + ($8 || ' days')::interval)
         RETURNING id`,
        [
          d.company.name,
          d.company.legal_name,
          slug,
          d.company.siret || null,
          d.company.vat_number || null,
          JSON.stringify({
            line1: d.company.address_line1 ?? '',
            zip: d.company.address_zip ?? '',
            city: d.company.address_city ?? '',
            country: 'FR',
          }),
          JSON.stringify({
            phone: d.company.phone ?? '',
            email: d.company.email ?? '',
          }),
          String(TRIAL_DAYS),
        ],
      );
      const orgId = orgIns.rows[0]!.id;

      // 4. Abonnement (trial)
      await client.query(
        `INSERT INTO subscriptions (organization_id, plan, status, current_period_start, current_period_end)
         VALUES ($1, 'trial', 'active', now(), now() + ($2 || ' days')::interval)
         ON CONFLICT (organization_id) DO NOTHING`,
        [orgId, String(TRIAL_DAYS)],
      );

      // 5. Boutique
      const storeIns = await client.query<{ id: string }>(
        `INSERT INTO stores (organization_id, code, name)
         VALUES ($1, $2, $3) RETURNING id`,
        [orgId, d.store.code, d.store.name],
      );
      const storeId = storeIns.rows[0]!.id;

      // 6. Caisse
      await client.query(
        `INSERT INTO registers (organization_id, store_id, code, name)
         VALUES ($1, $2, $3, $4)`,
        [orgId, storeId, d.register.code, d.register.name],
      );

      // 7. Taux TVA
      let hasDefault = d.tax_rates.some((t) => t.is_default);
      for (const t of d.tax_rates) {
        const isDef = t.is_default || (!hasDefault && t === d.tax_rates[0]);
        await client.query(
          `INSERT INTO tax_rates (organization_id, code, label, rate, is_default)
           VALUES ($1, $2, $3, $4, $5)`,
          [orgId, t.code, t.label, t.rate, isDef],
        );
        if (isDef) hasDefault = true;
      }

      // 8. Admin (mot de passe = password fourni OU PIN, hashé bcrypt)
      const passwordHash = await hashPassword(d.admin.password ?? d.admin.pin);
      const pinHash = await hashPassword(d.admin.pin);
      const userIns = await client.query<{ id: string; role: 'owner' }>(
        `INSERT INTO users (organization_id, email, password_hash, full_name, role, pin_code_hash)
         VALUES ($1, $2, $3, $4, 'owner', $5)
         RETURNING id, role`,
        [orgId, d.admin.email.toLowerCase(), passwordHash, d.admin.full_name, pinHash],
      );
      return {
        organization_id: orgId,
        slug,
        user_id: userIns.rows[0]!.id,
        role: userIns.rows[0]!.role,
        email: d.admin.email.toLowerCase(),
      };
    });

    // 9. Auto-login : session + cookie tenant
    const token = await createSession({
      userId: created.user_id,
      organizationId: created.organization_id,
      role: created.role,
      ip,
      userAgent: ua,
    });
    cookies().set({ ...sessionCookieOptions(), value: token });
    setTenantCookie(created.organization_id);

    return NextResponse.json({
      organization_id: created.organization_id,
      slug: created.slug,
      email: created.email,
    }, { status: 201 });
  } catch (err) {
    const m = (err as Error).message;
    if (m === 'EMAIL_ALREADY_TAKEN') {
      return jsonError('EMAIL_ALREADY_TAKEN', 409, {
        hint: 'Cet email est déjà utilisé. Connectez-vous ou utilisez un autre email.',
      });
    }
    if (m.includes('pin_code_hash')
        || m.includes('subscriptions')
        || m.includes('column "slug"')
        || m.includes('column "plan"')) {
      return NextResponse.json({
        error: 'MIGRATION_REQUIRED',
        message: 'Migrations manquantes : exécutez `npm run db:migrate` (jusqu\'à 0010_multi_tenant).',
      }, { status: 500 });
    }
    // eslint-disable-next-line no-console
    console.error('[auth.setup]', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: m }, { status: 500 });
  }
}

/**
 * Indique si l'instance accepte les nouvelles inscriptions.
 * En mode multi-tenant SaaS, c'est toujours `true`.
 */
export async function GET() {
  return NextResponse.json({
    setup_done: false,
    multi_tenant: true,
    trial_days: TRIAL_DAYS,
  });
}
