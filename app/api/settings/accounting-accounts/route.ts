import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import type { SalesAccountRule } from '@/lib/services/accounting-mapping';

export const dynamic = 'force-dynamic';

/**
 * Comptes de ventes par famille, taux de TVA et boutique.
 *
 * Lecture ouverte au comptable (`settings.read` le couvre) : il doit pouvoir
 * vérifier le paramétrage avant d'exporter. L'écriture reste au propriétaire —
 * un plan de comptes se décide, il ne se corrige pas à la volée depuis un poste.
 */

const schema = z.object({
  store_id: z.string().uuid().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  vat_rate: z.number().min(0).max(100).nullable().optional(),
  account_code: z.string().trim().min(1).max(20),
  account_label: z.string().trim().min(1).max(120),
  vat_account_code: z.string().trim().max(20).nullable().optional(),
  vat_account_label: z.string().trim().max(120).nullable().optional(),
});

/** Ligne enrichie des noms, pour que l'écran n'ait pas à les rechercher. */
export interface SalesAccountRow extends SalesAccountRule {
  store_name: string | null;
  category_name: string | null;
}

export async function GET() {
  const g = await requirePermission('accounting.read');
  if ('response' in g) return g.response;

  const { rows } = await query<SalesAccountRow>(
    `SELECT a.id, a.store_id, a.category_id,
            a.vat_rate::float8 AS vat_rate,
            a.account_code, a.account_label,
            a.vat_account_code, a.vat_account_label,
            st.name AS store_name, c.name AS category_name
       FROM accounting_sales_accounts a
       LEFT JOIN stores st ON st.id = a.store_id
       LEFT JOIN product_categories c ON c.id = a.category_id
      WHERE a.organization_id = $1
      ORDER BY a.account_code, a.account_label`,
    [g.user.organizationId],
  );
  return NextResponse.json({ accounts: rows });
}

export async function POST(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const a = parsed.data;

  try {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO accounting_sales_accounts
         (organization_id, store_id, category_id, vat_rate,
          account_code, account_label, vat_account_code, vat_account_label)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [g.user.organizationId, a.store_id ?? null, a.category_id ?? null,
       a.vat_rate ?? null, a.account_code, a.account_label,
       a.vat_account_code || null, a.vat_account_label || null],
    );
    return NextResponse.json({ id: rows[0]!.id });
  } catch (e) {
    // L'index unique protège le déterminisme de l'export : deux règles sur le
    // même croisement rendraient le compte retenu arbitraire.
    if (String((e as Error).message).includes('uniq_acct_sales_accounts_scope')) {
      return jsonError('DUPLICATE_SCOPE', 409,
        { message: 'Une règle existe déjà pour cette boutique, cette famille et ce taux.' });
    }
    throw e;
  }
}
