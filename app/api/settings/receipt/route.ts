import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { RECEIPT_KEY, mergeReceiptDefaults, type ReceiptSettings } from '@/lib/settings/receipt';

const schema = z.object({
  logo_data_url: z.string().max(200_000).optional(),
  shop_name: z.string().max(120).optional(),
  address_line1: z.string().max(160).optional(),
  address_zip_city: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  siret: z.string().max(40).optional(),
  vat_number: z.string().max(40).optional(),
  welcome_message: z.string().max(120).optional(),
  footer_message: z.string().max(500).optional(),
  show_barcode: z.boolean().optional(),
  show_tax_breakdown: z.boolean().optional(),
  auto_print_receipt: z.boolean().optional(),
  auto_print_z: z.boolean().optional(),
});

export async function GET() {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const { rows } = await query<{ value: Partial<ReceiptSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [g.user.organizationId, RECEIPT_KEY],
  );
  return NextResponse.json({ settings: mergeReceiptDefaults(rows[0]?.value ?? null) });
}

export async function PATCH(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  const current = await query<{ value: Partial<ReceiptSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [g.user.organizationId, RECEIPT_KEY],
  );
  const existing = current.rows[0]?.value ?? {};
  const merged = mergeReceiptDefaults({ ...existing, ...parsed.data });

  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [g.user.organizationId, RECEIPT_KEY, JSON.stringify(merged), g.user.id],
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'settings.receipt.update',
    entityType: 'settings',
    payload: { keys: Object.keys(parsed.data) },
  });

  return NextResponse.json({ settings: merged });
}
