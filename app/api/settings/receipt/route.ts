import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { receiptKey, mergeReceiptDefaults, type ReceiptSettings } from '@/lib/settings/receipt';
import { loadReceiptSettings } from '@/lib/settings/receipt-server';

const schema = z.object({
  store_id: z.string().uuid().optional(),
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

/** Vérifie que la boutique appartient à l'organisation de l'utilisateur. */
async function assertStoreInOrg(storeId: string, organizationId: string): Promise<boolean> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM stores WHERE id = $1 AND organization_id = $2`,
    [storeId, organizationId],
  );
  return rows.length > 0;
}

export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const storeId = new URL(req.url).searchParams.get('store_id') || undefined;
  if (storeId && !(await assertStoreInOrg(storeId, g.user.organizationId))) {
    return NextResponse.json({ error: 'STORE_NOT_FOUND' }, { status: 404 });
  }
  // Renvoie la configuration effective de la boutique (avec repli org).
  const settings = await loadReceiptSettings(g.user.organizationId, storeId);
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

  // On repart de la configuration effective (propre à la boutique si elle
  // existe, sinon modèle org / défauts) pour que les champs non modifiés
  // conservent leur valeur héritée.
  const existing = await loadReceiptSettings(g.user.organizationId, storeId);
  const merged: ReceiptSettings = mergeReceiptDefaults({ ...existing, ...fields });
  const key = receiptKey(storeId);

  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [g.user.organizationId, key, JSON.stringify(merged), g.user.id],
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'settings.receipt.update',
    entityType: 'settings',
    entityId: storeId ?? null,
    payload: { store_id: storeId ?? null, keys: Object.keys(fields) },
  });

  return NextResponse.json({ settings: merged });
}
