import { NextResponse } from 'next/server';
import { withTransaction } from '@/lib/db/client';
import { hashPassword } from '@/lib/auth/password';
import { jsonError } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

/**
 * Endpoint d'amorçage première utilisation : crée une organisation minimale
 * + un administrateur 'admin@webpos.test' avec PIN 1234.
 *
 * Sécurité : refuse si au moins UN utilisateur existe déjà dans la base.
 * Ne peut donc être exécuté qu'une seule fois, sur un système vierge.
 */
export async function POST() {
  try {
    const result = await withTransaction(async (client) => {
      const usersRes = await client.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM users`);
      if (Number(usersRes.rows[0]!.c) > 0) {
        throw new Error('ALREADY_BOOTSTRAPPED');
      }

      // Organisation minimale si aucune
      let orgId: string;
      const orgRes = await client.query<{ id: string }>(`SELECT id FROM organizations LIMIT 1`);
      if (orgRes.rowCount === 0) {
        const ins = await client.query<{ id: string }>(
          `INSERT INTO organizations (name, legal_name, address, contact)
           VALUES ('HelloPos Dev', 'HelloPos Dev',
                   '{"line1":"1 rue Test","zip":"75001","city":"Paris","country":"FR"}'::jsonb,
                   '{"email":"contact@webpos.test"}'::jsonb)
           RETURNING id`,
        );
        orgId = ins.rows[0]!.id;

        const storeIns = await client.query<{ id: string }>(
          `INSERT INTO stores (organization_id, code, name)
           VALUES ($1, 'DEV', 'Boutique dev') RETURNING id`,
          [orgId],
        );
        await client.query(
          `INSERT INTO registers (organization_id, store_id, code, name)
           VALUES ($1, $2, 'CAISSE-1', 'Caisse principale')`,
          [orgId, storeIns.rows[0]!.id],
        );

        const taxes: Array<[string, string, number, boolean]> = [
          ['TVA20', 'TVA 20% (taux normal)', 20, true],
          ['TVA10', 'TVA 10% (taux intermédiaire)', 10, false],
          ['TVA55', 'TVA 5,5%', 5.5, false],
        ];
        for (const [code, label, rate, def] of taxes) {
          await client.query(
            `INSERT INTO tax_rates (organization_id, code, label, rate, is_default)
             VALUES ($1,$2,$3,$4,$5)`,
            [orgId, code, label, rate, def],
          );
        }
      } else {
        orgId = orgRes.rows[0]!.id;
      }

      const pinHash = await hashPassword('1234');
      await client.query(
        `INSERT INTO users (organization_id, email, password_hash, full_name, role, pin_code_hash)
         VALUES ($1, 'admin@webpos.test', $2, 'Admin HelloPos', 'owner', $2)`,
        [orgId, pinHash],
      );

      return { email: 'admin@webpos.test', pin: '1234' };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const m = (err as Error).message;
    if (m === 'ALREADY_BOOTSTRAPPED') return jsonError('ALREADY_BOOTSTRAPPED', 409);
    // eslint-disable-next-line no-console
    console.error('[auth.bootstrap]', err);
    const hint = m.includes('pin_code_hash')
      ? 'Migration manquante : exécutez `npm run db:migrate` (0007_user_pin_and_settings.sql).'
      : m;
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: hint }, { status: 500 });
  }
}
