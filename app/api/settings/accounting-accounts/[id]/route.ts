import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

const schema = z.object({
  store_id: z.string().uuid().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  vat_rate: z.number().min(0).max(100).nullable().optional(),
  account_code: z.string().trim().min(1).max(20).optional(),
  account_label: z.string().trim().min(1).max(120).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  // Les critères de portée sont volontairement écrasés en bloc : un PATCH
  // partiel sur trois champs dont NULL est une valeur signifiante rendrait
  // impossible de distinguer « ne change pas » de « passe à toutes ».
  const p = parsed.data;
  const fields = Object.keys(p);
  if (fields.length === 0) return NextResponse.json({ ok: true });
  const sets = fields.map((f, i) => `${f} = $${i + 1}`);
  const values = fields.map((f) => (p as Record<string, unknown>)[f]);

  try {
    const { rowCount } = await query(
      `UPDATE accounting_sales_accounts
          SET ${sets.join(', ')}, updated_at = now()
        WHERE id = $${fields.length + 1} AND organization_id = $${fields.length + 2}`,
      [...values, params.id, g.user.organizationId],
    );
    if (!rowCount) return jsonError('NOT_FOUND', 404);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (String((e as Error).message).includes('uniq_acct_sales_accounts_scope')) {
      return jsonError('DUPLICATE_SCOPE', 409,
        { message: 'Une règle existe déjà pour cette boutique, cette famille et ce taux.' });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const { rowCount } = await query(
    `DELETE FROM accounting_sales_accounts WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (!rowCount) return jsonError('NOT_FOUND', 404);
  return NextResponse.json({ ok: true });
}
