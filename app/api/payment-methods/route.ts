import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';

const KINDS = ['cash','card','check','transfer','gift_card','credit_note','deferred','other'] as const;

const schema = z.object({
  code: z.string().max(40).optional(),
  kind: z.enum(KINDS),
  label: z.string().min(1).max(80),
  position: z.number().int().min(0).optional(),
});

export async function GET() {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const { rows } = await query(
    `SELECT id, code, kind, label, is_active, position
       FROM payment_methods WHERE organization_id = $1
      ORDER BY position, label`,
    [g.user.organizationId],
  );
  return NextResponse.json({ methods: rows });
}

export async function POST(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const m = parsed.data;
  const code = m.code ?? `${m.kind}_${Date.now().toString(36)}`;
  const ins = await query<{ id: string }>(
    `INSERT INTO payment_methods (organization_id, code, kind, label, position)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [g.user.organizationId, code, m.kind, m.label, m.position ?? 99],
  );
  return NextResponse.json({ id: ins.rows[0]!.id }, { status: 201 });
}
