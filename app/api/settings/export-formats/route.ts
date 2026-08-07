import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import {
  EXPORT_FORMATS_KEY, OPTIONAL_FORMATS, enabledOptionalFormats,
} from '@/lib/settings/export-formats';

export const dynamic = 'force-dynamic';

/**
 * Formats d'export facultatifs activés par l'organisation.
 *
 * Lecture ouverte à qui exporte — le comptable doit savoir quels formats lui
 * sont proposés. Écriture réservée au commerçant : c'est lui qui décide de ce
 * que son écran d'export affiche.
 */

async function read(orgId: string): Promise<string[]> {
  const { rows } = await query<{ value: unknown }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [orgId, EXPORT_FORMATS_KEY],
  );
  return enabledOptionalFormats(rows[0]?.value ?? null);
}

export async function GET() {
  const g = await requirePermission('fiscal.export');
  if ('response' in g) return g.response;
  return NextResponse.json({ optional: await read(g.user.organizationId) });
}

const schema = z.object({
  optional: z.array(z.enum(
    OPTIONAL_FORMATS.map((f) => f.value) as [string, ...string[]],
  )),
});

export async function PATCH(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  await query(
    `INSERT INTO settings (organization_id, key, value)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [g.user.organizationId, EXPORT_FORMATS_KEY,
     JSON.stringify({ optional: parsed.data.optional })],
  );
  return NextResponse.json({ optional: parsed.data.optional });
}
