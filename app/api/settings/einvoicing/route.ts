import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import {
  EINVOICING_KEY,
  EINVOICE_FORMATS,
  EINVOICE_MODES,
  mergeEInvoicingDefaults,
  maskKey,
  type EInvoicingSettings,
} from '@/lib/settings/einvoicing';

const schema = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(EINVOICE_MODES).optional(),
  format: z.enum(EINVOICE_FORMATS).optional(),
  pdp_name: z.string().max(120).optional(),
  pdp_endpoint: z.string().max(500).optional(),
  // clé API : vide = on conserve l'existante (ne pas écraser par vide)
  pdp_api_key: z.string().max(500).optional(),
  auto_send: z.boolean().optional(),
});

async function readRaw(orgId: string): Promise<Partial<EInvoicingSettings>> {
  const { rows } = await query<{ value: Partial<EInvoicingSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [orgId, EINVOICING_KEY],
  );
  return rows[0]?.value ?? {};
}

export async function GET() {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;
  const raw = await readRaw(g.user.organizationId);
  const merged = mergeEInvoicingDefaults(raw);
  // On ne renvoie JAMAIS la clé en clair : masquée + flag "définie".
  return NextResponse.json({
    settings: {
      ...merged,
      pdp_api_key: '',
      pdp_api_key_masked: maskKey(merged.pdp_api_key),
      pdp_api_key_set: !!merged.pdp_api_key,
    },
  });
}

export async function PATCH(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  const existing = await readRaw(g.user.organizationId);
  // La clé API n'est écrasée que si une nouvelle valeur non vide est fournie.
  const nextKey = d.pdp_api_key && d.pdp_api_key.trim().length > 0
    ? d.pdp_api_key.trim()
    : (existing.pdp_api_key ?? '');
  const merged = mergeEInvoicingDefaults({
    ...existing,
    ...d,
    pdp_api_key: nextKey,
  });

  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [g.user.organizationId, EINVOICING_KEY, JSON.stringify(merged), g.user.id],
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'settings.einvoicing.update',
    entityType: 'settings',
    payload: { ...d, pdp_api_key: d.pdp_api_key ? '****' : undefined },
  });

  return NextResponse.json({
    settings: {
      ...merged,
      pdp_api_key: '',
      pdp_api_key_masked: maskKey(merged.pdp_api_key),
      pdp_api_key_set: !!merged.pdp_api_key,
    },
  });
}
