import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guards';
import { accessibleStores } from '@/lib/auth/stores-server';
import { resolveDeviceStoreId } from '@/lib/pos/current-store';
import { loadIpPrinterSettings } from '@/lib/settings/ip-printer-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Config imprimante IP du POSTE courant, consommée par l'application native
 * (iOS/Android) pour router l'impression vers l'imprimante réseau.
 *
 * La boutique est résolue côté serveur (poste appairé -> sa boutique, sinon
 * première boutique accessible), comme à l'origine. `store_id`/`store_name`
 * sont renvoyés en plus, pour le bouton de diagnostic.
 */
export async function GET() {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;

  const stores = await accessibleStores(g.user);
  const storeId = (await resolveDeviceStoreId(g.user.organizationId)) ?? stores[0]?.id ?? null;

  const s = await loadIpPrinterSettings(g.user.organizationId, storeId);
  const configured = s.enabled && s.host.trim() !== '';

  return NextResponse.json({
    configured,
    host: s.host,
    port: s.port,
    widthDots: s.width_dots,
    store_id: storeId,
    store_name: stores.find((st) => st.id === storeId)?.name ?? null,
  });
}
