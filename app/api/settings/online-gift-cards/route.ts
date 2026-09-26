import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { storeInOrg } from '@/lib/auth/stores-server';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import {
  normalizeOrigins, InvalidOriginError,
  validateGiftCardCommerceConfig, InvalidAmountError,
} from '@/lib/settings/online-gift-cards';
import { loadOnlineGiftCards, saveOnlineGiftCards } from '@/lib/settings/online-gift-cards-server';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  store_id: z.string().uuid().optional(),
  enabled: z.boolean().optional(),
  allowed_origins: z.array(z.string().max(300)).max(50).optional(),
  preset_amounts: z.array(z.number()).max(20).optional(),
  allow_custom_amount: z.boolean().optional(),
  min_amount: z.number().optional(),
  max_amount: z.number().optional(),
});

async function resolveStoreId(organizationId: string, rawStoreId: string | null): Promise<{ storeId: string | null } | { error: NextResponse }> {
  if (!rawStoreId) return { storeId: null };
  if (!(await storeInOrg(rawStoreId, organizationId))) {
    return { error: jsonError('STORE_NOT_FOUND', 404) };
  }
  return { storeId: rawStoreId };
}

/**
 * Configuration « Cartes cadeaux en ligne » d'UNE BOUTIQUE de l'organisation
 * courante (`store_id` en query param / champ PATCH — jamais fait confiance
 * sans vérifier qu'elle appartient bien à l'organisation de l'appelant, voir
 * `storeInOrg`). Sans `store_id` : configuration historique au niveau
 * organisation (repli, avant cette évolution — voir
 * lib/settings/online-gift-cards-server.ts).
 */
export async function GET(req: Request) {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;
  const rawStoreId = new URL(req.url).searchParams.get('store_id');
  const resolved = await resolveStoreId(g.user.organizationId, rawStoreId);
  if ('error' in resolved) return resolved.error;
  const settings = await loadOnlineGiftCards(g.user.organizationId, resolved.storeId);
  return NextResponse.json({ settings });
}

export async function PATCH(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, patchSchema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  const resolved = await resolveStoreId(g.user.organizationId, d.store_id ?? null);
  if ('error' in resolved) return resolved.error;
  const { storeId } = resolved;

  const current = await loadOnlineGiftCards(g.user.organizationId, storeId);

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

  // Montants : validés ENSEMBLE (montants proposés vs bornes min/max) dès que
  // l'un des quatre champs est touché, même en modification partielle — pas
  // question d'enregistrer par exemple un nouveau min_amount sans revérifier
  // qu'il reste cohérent avec les montants proposés déjà en place.
  let { preset_amounts, allow_custom_amount, min_amount, max_amount } = current;
  const commerceTouched = d.preset_amounts !== undefined || d.allow_custom_amount !== undefined
    || d.min_amount !== undefined || d.max_amount !== undefined;
  if (commerceTouched) {
    try {
      const validated = validateGiftCardCommerceConfig({
        preset_amounts: d.preset_amounts ?? current.preset_amounts,
        allow_custom_amount: d.allow_custom_amount ?? current.allow_custom_amount,
        min_amount: d.min_amount ?? current.min_amount,
        max_amount: d.max_amount ?? current.max_amount,
      });
      preset_amounts = validated.preset_amounts;
      allow_custom_amount = validated.allow_custom_amount;
      min_amount = validated.min_amount;
      max_amount = validated.max_amount;
    } catch (e) {
      if (e instanceof InvalidAmountError) return jsonError('INVALID_AMOUNT', 422, { message: e.message });
      return jsonError((e as Error).message ?? 'INVALID_AMOUNTS', 422);
    }
  }

  const next = {
    ...current,
    enabled: d.enabled ?? current.enabled,
    allowed_origins,
    preset_amounts,
    allow_custom_amount,
    min_amount,
    max_amount,
  };
  await saveOnlineGiftCards(g.user.organizationId, storeId, next, g.user.id);

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'online_gift_cards.update', entityType: 'settings', entityId: storeId,
    payload: {
      store_id: storeId,
      enabled: next.enabled, allowed_origins_count: next.allowed_origins.length,
      preset_amounts: next.preset_amounts, allow_custom_amount: next.allow_custom_amount,
      min_amount: next.min_amount, max_amount: next.max_amount,
    },
  });

  return NextResponse.json({ settings: next });
}
