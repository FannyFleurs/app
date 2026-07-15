import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { storeInOrg } from '@/lib/auth/stores-server';
import { scopedSettingKey } from '@/lib/settings/scoped';
import { loadScopedSettingValue } from '@/lib/settings/scoped-server';
import {
  PRINTER_KEY,
  mergePrinterDefaults,
  type PrinterSettings,
} from '@/lib/settings/printer';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;
  const storeId = new URL(req.url).searchParams.get('store_id') || undefined;
  if (storeId && !(await storeInOrg(storeId, g.user.organizationId))) {
    return jsonError('STORE_NOT_FOUND', 404);
  }
  const value = await loadScopedSettingValue<PrinterSettings>(
    g.user.organizationId, PRINTER_KEY, storeId,
  );
  return NextResponse.json({ settings: mergePrinterDefaults(value) });
}

const schema = z.object({
  store_id: z.string().uuid().optional(),
  enabled: z.boolean(),
  ip: z.string().max(64),
  port: z.number().int().min(1).max(65535),
  paper_width: z.union([z.literal(58), z.literal(80)]),
  brand: z.string().max(120),
});

export async function PATCH(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { store_id: storeId, ...v } = parsed.data;
  if (storeId && !(await storeInOrg(storeId, g.user.organizationId))) {
    return jsonError('STORE_NOT_FOUND', 404);
  }
  const key = scopedSettingKey(PRINTER_KEY, storeId);

  try {
    await query(
      `INSERT INTO settings (organization_id, key, value, updated_by)
         VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (organization_id, key)
       DO UPDATE SET value = EXCLUDED.value,
                     updated_by = EXCLUDED.updated_by,
                     updated_at = now()`,
      [g.user.organizationId, key, JSON.stringify(v), g.user.id],
    );
    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'settings.printer.update',
      entityType: 'settings', entityId: storeId ?? null,
      payload: { store_id: storeId ?? null, ...v },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError('INTERNAL_ERROR', 500, { message: (err as Error).message });
  }
}
