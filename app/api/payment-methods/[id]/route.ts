import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';

const patch = z.object({
  label: z.string().min(1).max(80).optional(),
  is_active: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, patch);
  if ('response' in parsed) return parsed.response;
  const fields = Object.keys(parsed.data);
  if (fields.length === 0) return NextResponse.json({ ok: true });
  const sets = fields.map((f, i) => `${f} = $${i + 1}`);
  const vals: unknown[] = fields.map((f) => (parsed.data as Record<string, unknown>)[f]);
  vals.push(params.id, g.user.organizationId);
  const res = await query(
    `UPDATE payment_methods SET ${sets.join(', ')}, updated_at = now()
      WHERE id = $${fields.length + 1} AND organization_id = $${fields.length + 2}`,
    vals,
  );
  if (res.rowCount === 0) return jsonError('NOT_FOUND', 404);
  return NextResponse.json({ ok: true });
}
