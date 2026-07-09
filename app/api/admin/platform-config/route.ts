import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import {
  mergePlatformDefaults,
  type PlatformSettings,
} from '@/lib/settings/platform';

export const dynamic = 'force-dynamic';

const schema = z.object({
  brand_name: z.string().max(80).optional(),
  // Logo : URL http(s) ou data URL. On limite la taille pour eviter de
  // stocker une image enorme dans la ligne JSONB (~1 Mo max).
  logo_url: z.string().max(1_500_000).optional(),
  company_legal_name: z.string().max(160).optional(),
  company_siren: z.string().max(15).optional(),
  company_siret: z.string().max(20).optional(),
  company_vat: z.string().max(40).optional(),
  address_line1: z.string().max(200).optional(),
  address_zip: z.string().max(20).optional(),
  address_city: z.string().max(120).optional(),
  address_country: z.string().max(80).optional(),
  contact_email: z.string().max(160).optional(),
  contact_phone: z.string().max(40).optional(),
  website: z.string().max(200).optional(),
});

async function readRaw(): Promise<Partial<PlatformSettings>> {
  const { rows } = await query<{ value: Partial<PlatformSettings> }>(
    `SELECT value FROM platform_settings WHERE id = 1`,
  );
  return rows[0]?.value ?? {};
}

export async function GET() {
  const g = await requireSuperAdmin();
  if ('response' in g) return g.response;
  try {
    const raw = await readRaw();
    return NextResponse.json({ settings: mergePlatformDefaults(raw) });
  } catch {
    // Migration 0029 pas encore appliquee.
    return NextResponse.json({
      settings: mergePlatformDefaults(null),
      migration_required: '0029_platform_settings',
    });
  }
}

export async function PATCH(req: Request) {
  const g = await requireSuperAdmin();
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  const existing = await readRaw();
  const merged = mergePlatformDefaults({ ...existing, ...parsed.data });

  await query(
    `INSERT INTO platform_settings (id, value, updated_by, updated_at)
     VALUES (1, $1, $2, now())
     ON CONFLICT (id)
     DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [JSON.stringify(merged), g.user.id],
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'admin.platform_config.update',
    entityType: 'platform_settings',
    payload: { keys: Object.keys(parsed.data) },
  });

  return NextResponse.json({ settings: merged });
}
