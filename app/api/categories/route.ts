import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';

const schema = z.object({
  name: z.string().min(1).max(120),
  parent_id: z.string().uuid().nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  icon: z.string().max(40).nullable().optional(),
  image_url: z.string().max(2048).nullable().optional(),
  position: z.number().int().nonnegative().default(0),
  visible_in_pos: z.boolean().default(true),
});

export async function GET() {
  const g = await requirePermission('products.read');
  if ('response' in g) return g.response;
  const { rows } = await query(
    `SELECT id, name, parent_id, color, icon, image_url, position, visible_in_pos, is_active
       FROM product_categories
      WHERE organization_id = $1 AND is_active = TRUE
      ORDER BY position ASC, name ASC`,
    [g.user.organizationId],
  );
  return NextResponse.json({ categories: rows });
}

export async function POST(req: Request) {
  const g = await requirePermission('categories.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const c = parsed.data;
  try {
    const ins = await query<{ id: string }>(
      `INSERT INTO product_categories
         (organization_id, name, parent_id, color, icon, image_url, position, visible_in_pos)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        g.user.organizationId,
        c.name,
        c.parent_id ?? null,
        c.color ?? null,
        c.icon ?? null,
        c.image_url ?? null,
        c.position,
        c.visible_in_pos,
      ],
    );
    return NextResponse.json({ id: ins.rows[0]!.id }, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[categories.create]', err);
    const m = (err as Error).message ?? '';
    const hint = m.includes('image_url')
      ? 'Migration manquante : exécutez `npm run db:migrate` pour appliquer 0003_category_image.sql.'
      : m;
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: hint }, { status: 500 });
  }
}
