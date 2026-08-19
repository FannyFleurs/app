import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { ipPrinterKey, mergeIpPrinterDefaults, type IpPrinterSettings } from '@/lib/settings/ip-printer';
import { loadIpPrinterSettings } from '@/lib/settings/ip-printer-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  store_id: z.string().uuid().optional(),
  enabled: z.boolean().optional(),
  host: z.string().max(120).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  width_dots: z.union([z.literal(384), z.literal(576)]).optional(),
});

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
  const settings = await loadIpPrinterSettings(g.user.organizationId, storeId);
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

  // On repart de la configuration effective pour préserver les champs non
  // modifiés (repli boutique -> organisation -> défauts).
  const existing = await loadIpPrinterSettings(g.user.organizationId, storeId);
  const merged: IpPrinterSettings = mergeIpPrinterDefaults({ ...existing, ...fields });
  const key = ipPrinterKey(storeId);

  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [g.user.organizationId, key, JSON.stringify(merged), g.user.id],
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'settings.ip_printer.update',
    entityType: 'settings',
    entityId: storeId ?? null,
    payload: { store_id: storeId ?? null, keys: Object.keys(fields) },
  });

  return NextResponse.json({ settings: merged });
}
