import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withTransaction } from '@/lib/db/client';
import { hashPassword } from '@/lib/auth/password';
import { jsonError } from '@/lib/validation/api';
import { parseJson } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

/**
 * Setup multi-étapes : crée une organisation complète à partir des
 * informations saisies par le wizard /setup.
 *
 * Sécurité : refuse si au moins UN utilisateur existe déjà dans la base.
 * Ne peut donc être exécuté qu'une seule fois, sur un système vierge.
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
  }),
  tax_rates: z.array(z.object({
    code: z.string().min(1).max(40),
    label: z.string().min(1).max(120),
    rate: z.number().min(0).max(100),
    is_default: z.boolean().optional(),
  })).min(1).max(10),
});

export async function POST(req: Request) {
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  try {
    const result = await withTransaction(async (client) => {
      const usersRes = await client.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM users`);
      if (Number(usersRes.rows[0]!.c) > 0) {
        throw new Error('ALREADY_SETUP');
      }

      const orgIns = await client.query<{ id: string }>(
        `INSERT INTO organizations (name, legal_name, siret, vat_number, address, contact)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          d.company.name,
          d.company.legal_name,
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
        ],
      );
      const orgId = orgIns.rows[0]!.id;

      const storeIns = await client.query<{ id: string }>(
        `INSERT INTO stores (organization_id, code, name)
         VALUES ($1, $2, $3) RETURNING id`,
        [orgId, d.store.code, d.store.name],
      );
      const storeId = storeIns.rows[0]!.id;

      await client.query(
        `INSERT INTO registers (organization_id, store_id, code, name)
         VALUES ($1, $2, $3, $4)`,
        [orgId, storeId, d.register.code, d.register.name],
      );

      // Au moins un taux par défaut : si l'utilisateur n'a coché aucun is_default,
      // on prend le premier de la liste.
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

      const pinHash = await hashPassword(d.admin.pin);
      await client.query(
        `INSERT INTO users (organization_id, email, password_hash, full_name, role, pin_code_hash)
         VALUES ($1, $2, $3, $4, 'owner', $3)`,
        [orgId, d.admin.email.toLowerCase(), pinHash, d.admin.full_name],
      );

      return {
        organization_id: orgId,
        email: d.admin.email.toLowerCase(),
      };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const m = (err as Error).message;
    if (m === 'ALREADY_SETUP') return jsonError('ALREADY_SETUP', 409);
    if (m.includes('pin_code_hash')) {
      return NextResponse.json({
        error: 'INTERNAL_ERROR',
        message: 'Migration manquante : exécutez `npm run db:migrate`.',
      }, { status: 500 });
    }
    // eslint-disable-next-line no-console
    console.error('[auth.setup]', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: m }, { status: 500 });
  }
}

/** Indique si le système est déjà configuré (au moins un user présent). */
export async function GET() {
  const { withTransaction } = await import('@/lib/db/client');
  try {
    const out = await withTransaction(async (client) => {
      const r = await client.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM users`);
      return { setup_done: Number(r.rows[0]!.c) > 0 };
    });
    return NextResponse.json(out);
  } catch (err) {
    return NextResponse.json({
      setup_done: false,
      error: (err as Error).message,
    });
  }
}
