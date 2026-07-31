import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { invoiceSettingsKey, mergeInvoiceDefaults, type InvoiceSettings } from '@/lib/settings/invoice';
import { loadInvoiceSettings } from '@/lib/settings/invoice-server';

const schema = z.object({
  store_id: z.string().uuid().optional(),
  show_bank_details: z.boolean().optional(),
  bank_holder: z.string().max(160).optional(),
  bank_name: z.string().max(160).optional(),
  bank_iban: z.string().max(60).optional(),
  bank_bic: z.string().max(20).optional(),
  default_payment_terms: z.string().max(40).optional(),
});

async function assertStoreInOrg(storeId: string, organizationId: string): Promise<boolean> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM stores WHERE id = $1 AND organization_id = $2`,
    [storeId, organizationId],
  );
  return rows.length > 0;
}

export async function GET(req: Request) {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;
  const storeId = new URL(req.url).searchParams.get('store_id') || undefined;
  if (storeId && !(await assertStoreInOrg(storeId, g.user.organizationId))) {
    return NextResponse.json({ error: 'STORE_NOT_FOUND' }, { status: 404 });
  }
  const settings = await loadInvoiceSettings(g.user.organizationId, storeId);
  return NextResponse.json({ settings });
}

export async function PATCH(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  const { store_id: storeId, ...fields } = parsed.data;
  if (storeId && !(await assertStoreInOrg(storeId, g.user.organizationId))) {
    return NextResponse.json({ error: 'STORE_NOT_FOUND' }, { status: 404 });
  }

  const existing = await loadInvoiceSettings(g.user.organizationId, storeId);
  const merged: InvoiceSettings = mergeInvoiceDefaults({ ...existing, ...fields });
  const key = invoiceSettingsKey(storeId);

  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [g.user.organizationId, key, JSON.stringify(merged), g.user.id],
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'settings.invoicing.update',
    entityType: 'settings',
    entityId: storeId ?? null,
    payload: { store_id: storeId ?? null, keys: Object.keys(fields) },
  });

  return NextResponse.json({ settings: merged });
}
