import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query, withTransaction } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

const schema = z.object({
  code: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  rate: z.number().min(0).max(100),
  is_default: z.boolean().optional(),
});

export async function GET() {
  const g = await requirePermission('products.read');
  if ('response' in g) return g.response;
  const { rows } = await query(
    `SELECT id, code, label, rate, is_default, is_active
       FROM tax_rates
      WHERE organization_id = $1 AND is_active = TRUE
      ORDER BY is_default DESC, rate DESC`,
    [g.user.organizationId],
  );
  return NextResponse.json({ tax_rates: rows });
}

export async function POST(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  try {
    const id = await withTransaction(async (client) => {
      if (d.is_default) {
        await client.query(
          `UPDATE tax_rates SET is_default = FALSE WHERE organization_id = $1`,
          [g.user.organizationId],
        );
      }
      const ins = await client.query<{ id: string }>(
        `INSERT INTO tax_rates (organization_id, code, label, rate, is_default, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id`,
        [g.user.organizationId, d.code, d.label, d.rate, d.is_default ?? false],
      );
      return ins.rows[0]!.id;
    });
    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'tax_rates.create', entityType: 'tax_rate', entityId: id,
      payload: d,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    const m = (err as Error).message ?? '';
    if (m.includes('duplicate')) return jsonError('CODE_ALREADY_EXISTS', 409);
    console.error('[tax_rates.create]', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: m }, { status: 500 });
  }
}
