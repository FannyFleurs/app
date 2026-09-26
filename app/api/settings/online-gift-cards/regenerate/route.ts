import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guards';
import { audit } from '@/lib/audit/log';
import { regenerateOnlineGiftCardsKey } from '@/lib/settings/online-gift-cards-server';

export const dynamic = 'force-dynamic';

/**
 * Régénère la clé publique d'intégration de l'organisation courante.
 * La clé n'étant pas un secret d'authentification, elle est renvoyée en clair
 * ici comme partout ailleurs (contrairement à un jeton/mot de passe).
 */
export async function POST() {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;

  const settings = await regenerateOnlineGiftCardsKey(g.user.organizationId, g.user.id);

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'online_gift_cards.regenerate_key', entityType: 'settings', entityId: null,
    payload: {},
  });

  return NextResponse.json({ settings });
}
