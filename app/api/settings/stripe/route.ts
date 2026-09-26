import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { storeInOrg } from '@/lib/auth/stores-server';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { maskKey, type StripeSettings } from '@/lib/settings/stripe';
import { loadStripeSettings, saveStripeSettings } from '@/lib/settings/stripe-server';
import { isEncryptionConfigured } from '@/lib/security/secret-crypto';

/**
 * Configuration Stripe PAR BOUTIQUE (repli organisation) — voir
 * lib/settings/stripe-server.ts. `store_id` (query param en GET, champ en
 * PATCH) sélectionne la boutique concernée ; absent = configuration au
 * niveau organisation (comportement historique, avant cette évolution).
 *
 * `store_id` est TOUJOURS vérifié contre l'organisation de l'appelant
 * (`storeInOrg`) avant tout accès — jamais fait confiance tel quel, même
 * venant d'un utilisateur authentifié de CETTE organisation (une boutique
 * d'une AUTRE organisation ne doit jamais pouvoir être ciblée).
 */

async function resolveStoreId(req: Request, organizationId: string, rawStoreId: string | null): Promise<{ storeId: string | null } | { error: NextResponse }> {
  if (!rawStoreId) return { storeId: null };
  if (!(await storeInOrg(rawStoreId, organizationId))) {
    return { error: jsonError('STORE_NOT_FOUND', 404) };
  }
  return { storeId: rawStoreId };
}

export async function GET(req: Request) {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;
  const rawStoreId = new URL(req.url).searchParams.get('store_id');
  const resolved = await resolveStoreId(req, g.user.organizationId, rawStoreId);
  if ('error' in resolved) return resolved.error;

  const { settings: s, ownStore, decryptionFailed } = await loadStripeSettings(g.user.organizationId, resolved.storeId);
  return NextResponse.json({
    inherited: !!resolved.storeId && !ownStore, // config affichée = héritée de l'organisation
    encryption_configured: isEncryptionConfigured(),
    decryption_failed: decryptionFailed,
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

const schema = z.object({
  store_id: z.string().uuid().optional(),
  enabled: z.boolean().optional(),
  publishable_key: z.string().max(200).optional(),
  secret_key: z.string().max(200).optional(),
  webhook_secret: z.string().max(200).optional(),
  return_url: z.string().max(500).optional(),
});

export async function PATCH(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  const resolved = await resolveStoreId(req, g.user.organizationId, d.store_id ?? null);
  if ('error' in resolved) return resolved.error;
  const { storeId } = resolved;

  const { settings: existing } = await loadStripeSettings(g.user.organizationId, storeId);
  // Si secret_key/webhook_secret sont envoyés vides, on garde la valeur
  // existante (permet à l'UI de ne pas tout renvoyer à chaque PATCH — elle
  // ne reçoit d'ailleurs jamais le secret en clair, voir GET ci-dessus).
  const merged: StripeSettings = {
    enabled: d.enabled ?? existing.enabled,
    publishable_key: d.publishable_key ?? existing.publishable_key,
    return_url: d.return_url ?? existing.return_url,
    secret_key: d.secret_key?.trim() ? d.secret_key.trim() : existing.secret_key,
    webhook_secret: d.webhook_secret?.trim() ? d.webhook_secret.trim() : existing.webhook_secret,
  };

  await saveStripeSettings(g.user.organizationId, storeId, merged, g.user.id);

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'settings.stripe.update',
    entityType: 'settings',
    entityId: storeId,
    payload: { keys: Object.keys(parsed.data), store_id: storeId },
  });

  return NextResponse.json({ ok: true });
}
