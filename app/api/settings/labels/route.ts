import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { LABEL_KEY, mergeLabelDefaults, type LabelSettings } from '@/lib/settings/label';

const elLayout = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  size: z.number().min(0.3).max(3),
});
const schema = z.object({
  width_mm: z.number().min(10).max(200).optional(),
  height_mm: z.number().min(10).max(200).optional(),
  gap_mm: z.number().min(0).max(20).optional(),
  show_name: z.boolean().optional(),
  show_barcode: z.boolean().optional(),
  show_price: z.boolean().optional(),
  show_discount: z.boolean().optional(),
  show_sku: z.boolean().optional(),
  layout: z.object({
    name: elLayout, price: elLayout, barcode: elLayout, sku: elLayout,
  }).optional(),
  /** Calage vertical de l'impression, en mm (négatif = remonte le contenu). */
  print_offset_y_mm: z.number().min(-15).max(15).optional(),
  /** Calage horizontal, en mm (négatif = vers la gauche). */
  print_offset_x_mm: z.number().min(-15).max(15).optional(),
});

export async function GET() {
  const g = await requirePermission('products.read');
  if ('response' in g) return g.response;
  const { rows } = await query<{ value: Partial<LabelSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [g.user.organizationId, LABEL_KEY],
  );
  return NextResponse.json({ settings: mergeLabelDefaults(rows[0]?.value ?? null) });
}

export async function PATCH(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  const current = await query<{ value: Partial<LabelSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [g.user.organizationId, LABEL_KEY],
  );
  const merged = mergeLabelDefaults({ ...(current.rows[0]?.value ?? {}), ...parsed.data });

  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [g.user.organizationId, LABEL_KEY, JSON.stringify(merged), g.user.id],
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'settings.label.update', entityType: 'settings',
    payload: { keys: Object.keys(parsed.data) },
  });

  return NextResponse.json({ settings: merged });
}
