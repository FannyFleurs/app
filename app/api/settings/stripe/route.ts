import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { STRIPE_KEY, mergeStripeDefaults, maskKey, type StripeSettings } from '@/lib/settings/stripe';

const schema = z.object({
  enabled: z.boolean().optional(),
  publishable_key: z.string().max(200).optional(),
  secret_key: z.string().max(200).optional(),
  webhook_secret: z.string().max(200).optional(),
  return_url: z.string().max(500).optional(),
});

export async function GET() {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;
  const { rows } = await query<{ value: Partial<StripeSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [g.user.organizationId, STRIPE_KEY],
  );
  const s = mergeStripeDefaults(rows[0]?.value ?? null);
  return NextResponse.json({
    settings: {
      enabled: s.enabled,
      publishable_key: s.publishable_key,
      secret_key_masked: s.secret_key ? maskKey(s.secret_key) : '',
      secret_key_set: !!s.secret_key,
      webhook_secret_masked: s.webhook_secret ? maskKey(s.webhook_secret) : '',
      webhook_secret_set: !!s.webhook_secret,
      return_url: s.return_url,
    },
  });
}

export async function PATCH(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  const current = await query<{ value: Partial<StripeSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [g.user.organizationId, STRIPE_KEY],
  );
  const existing = current.rows[0]?.value ?? {};
  // Si secret_key/webhook_secret sont envoyés vides, on garde la valeur existante.
  // (Permet à l'UI de ne pas tout réenvoyer à chaque PATCH.)
  const merged = mergeStripeDefaults({
    ...existing,
    ...parsed.data,
    secret_key: parsed.data.secret_key?.trim()
      ? parsed.data.secret_key.trim()
      : existing.secret_key,
    webhook_secret: parsed.data.webhook_secret?.trim()
      ? parsed.data.webhook_secret.trim()
      : existing.webhook_secret,
  });

  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [g.user.organizationId, STRIPE_KEY, JSON.stringify(merged), g.user.id],
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'settings.stripe.update',
    entityType: 'settings',
    payload: { keys: Object.keys(parsed.data) },
  });

  return NextResponse.json({ ok: true });
}
