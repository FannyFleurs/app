import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';

const patchSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  contact_name: z.string().max(160).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('products.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, patchSchema);
  if ('response' in parsed) return parsed.response;
  const patch = parsed.data;

  const fields = Object.keys(patch);
  if (fields.length === 0) return NextResponse.json({ ok: true });
  const sets = fields.map((f, i) => `${f} = $${i + 1}`);
  const values: unknown[] = fields.map((f) => (patch as Record<string, unknown>)[f]);
  values.push(params.id, g.user.organizationId);
  const res = await query(
    `UPDATE suppliers
        SET ${sets.join(', ')}, updated_at = now()
      WHERE id = $${fields.length + 1} AND organization_id = $${fields.length + 2}`,
    values,
  );
  if (res.rowCount === 0) return jsonError('NOT_FOUND', 404);
  return NextResponse.json({ ok: true });
}
