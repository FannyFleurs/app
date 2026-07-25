import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query, withTransaction } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

const patchSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  rate: z.number().min(0).max(100).optional(),
  is_default: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, patchSchema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  const existing = await query<{ id: string }>(
    `SELECT id FROM tax_rates WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (existing.rowCount === 0) return jsonError('NOT_FOUND', 404);

  await withTransaction(async (client) => {
    if (d.is_default === true) {
      await client.query(
        `UPDATE tax_rates SET is_default = FALSE WHERE organization_id = $1`,
        [g.user.organizationId],
      );
    }
    await client.query(
      `UPDATE tax_rates
          SET label = COALESCE($3, label),
              rate = COALESCE($4, rate),
              is_default = COALESCE($5, is_default),
              is_active = COALESCE($6, is_active),
              updated_at = now()
        WHERE id = $1 AND organization_id = $2`,
      [params.id, g.user.organizationId,
        d.label ?? null, d.rate ?? null,
        d.is_default ?? null, d.is_active ?? null],
    );
  });

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'tax_rates.update', entityType: 'tax_rate', entityId: params.id, payload: d,
  });
  return NextResponse.json({ ok: true });
}

/** Désactive un taux (soft-delete). Les ventes passées gardent leur taux figé. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;

  const r = await query<{ is_default: boolean }>(
    `SELECT is_default FROM tax_rates WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (r.rowCount === 0) return jsonError('NOT_FOUND', 404);
  if (r.rows[0]!.is_default) return jsonError('CANNOT_DELETE_DEFAULT', 422);

  await query(
    `UPDATE tax_rates SET is_active = FALSE, updated_at = now()
      WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'tax_rates.deactivate', entityType: 'tax_rate', entityId: params.id, payload: {},
  });
  return NextResponse.json({ ok: true });
}
