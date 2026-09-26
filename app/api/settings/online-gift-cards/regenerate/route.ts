import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guards';
import { storeInOrg } from '@/lib/auth/stores-server';
import { jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { regenerateOnlineGiftCardsKey } from '@/lib/settings/online-gift-cards-server';

export const dynamic = 'force-dynamic';

/**
 * Régénère la clé publique d'intégration d'UNE BOUTIQUE (`store_id` en
 * query param — vérifié contre l'organisation de l'appelant, jamais fait
 * confiance tel quel). Sans `store_id` : configuration historique au niveau
 * organisation (repli, avant cette évolution).
 * La clé n'étant pas un secret d'authentification, elle est renvoyée en clair
 * ici comme partout ailleurs (contrairement à un jeton/mot de passe).
 */
export async function POST(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;

  const rawStoreId = new URL(req.url).searchParams.get('store_id');
  let storeId: string | null = null;
  if (rawStoreId) {
    if (!(await storeInOrg(rawStoreId, g.user.organizationId))) return jsonError('STORE_NOT_FOUND', 404);
    storeId = rawStoreId;
  }

  const settings = await regenerateOnlineGiftCardsKey(g.user.organizationId, storeId, g.user.id);

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'online_gift_cards.regenerate_key', entityType: 'settings', entityId: storeId,
    payload: { store_id: storeId },
  });

  return NextResponse.json({ settings });
}
