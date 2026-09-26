import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { normalizeOrigins, InvalidOriginError } from '@/lib/settings/online-gift-cards';
import { loadOnlineGiftCards, saveOnlineGiftCards } from '@/lib/settings/online-gift-cards-server';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  allowed_origins: z.array(z.string().max(300)).max(50).optional(),
});

/**
 * Configuration « Cartes cadeaux en ligne » de l'organisation COURANTE
 * (celle de l'utilisateur connecté — jamais choisie par le frontend).
 * `organization_id` est toujours pris de la session, jamais du payload.
 */
export async function GET() {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;
  const settings = await loadOnlineGiftCards(g.user.organizationId);
  return NextResponse.json({ settings });
}

export async function PATCH(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, patchSchema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  const current = await loadOnlineGiftCards(g.user.organizationId);

  let allowed_origins = current.allowed_origins;
  if (d.allowed_origins !== undefined) {
    try {
      allowed_origins = normalizeOrigins(d.allowed_origins);
    } catch (e) {
      if (e instanceof InvalidOriginError) {
        return jsonError('INVALID_ORIGIN', 422, { origin: e.value });
      }
      return jsonError((e as Error).message ?? 'INVALID_ORIGINS', 422);
    }
  }

  const next = {
    ...current,
    enabled: d.enabled ?? current.enabled,
    allowed_origins,
  };
  await saveOnlineGiftCards(g.user.organizationId, next, g.user.id);

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'online_gift_cards.update', entityType: 'settings', entityId: null,
    payload: { enabled: next.enabled, allowed_origins_count: next.allowed_origins.length },
  });

  return NextResponse.json({ settings: next });
}
