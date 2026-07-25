import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { storeInOrg } from '@/lib/auth/stores-server';
import { TAX_KEY, taxKey, mergeTaxDefaults, type TaxStoreSettings } from '@/lib/settings/tax';

export const dynamic = 'force-dynamic';

/**
 * Charge le taux TVA par défaut d'une boutique (repli sur le défaut
 * organisation quand la boutique n'a pas encore le sien).
 */
async function load(orgId: string, storeId?: string | null): Promise<{ settings: TaxStoreSettings; ownStore: boolean }> {
  const storeKey = taxKey(storeId);
  const { rows } = await query<{ value: Partial<TaxStoreSettings>; key: string }>(
    `SELECT value, key FROM settings
      WHERE organization_id = $1 AND key = ANY($2::text[])
      ORDER BY (key = $3) DESC
      LIMIT 1`,
    [orgId, [storeKey, TAX_KEY], storeKey],
  );
  return {
    settings: mergeTaxDefaults(rows[0]?.value ?? null),
    ownStore: !!storeId && rows[0]?.key === storeKey,
  };
}

export async function GET(req: Request) {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;
  const storeId = new URL(req.url).searchParams.get('store_id') || null;
  const { settings, ownStore } = await load(g.user.organizationId, storeId);
  return NextResponse.json({
    inherited: !!storeId && !ownStore,
    settings,
  });
}

const schema = z.object({
  store_id: z.string().uuid().optional(),
  default_code: z.string().max(40).nullable(),
});

export async function PATCH(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { store_id, default_code } = parsed.data;

  if (store_id && !(await storeInOrg(store_id, g.user.organizationId))) {
    return NextResponse.json({ error: 'STORE_NOT_FOUND' }, { status: 400 });
  }

  // Le code doit correspondre à un taux actif de l'organisation (ou null).
  if (default_code) {
    const r = await query(
      `SELECT 1 FROM tax_rates WHERE organization_id = $1 AND code = $2 AND is_active = TRUE`,
      [g.user.organizationId, default_code],
    );
    if (r.rowCount === 0) return NextResponse.json({ error: 'TAX_CODE_NOT_FOUND' }, { status: 400 });
  }

  const key = taxKey(store_id ?? null);
  await query(
    `INSERT INTO settings (organization_id, key, value, updated_at)
     VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = $3::jsonb, updated_at = now()`,
    [g.user.organizationId, key, JSON.stringify({ default_code: default_code ?? null })],
  );
  return NextResponse.json({ ok: true });
}
