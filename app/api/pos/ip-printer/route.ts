import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requirePermission } from '@/lib/auth/guards';
import { accessibleStores } from '@/lib/auth/stores-server';
import { resolveDeviceStoreId } from '@/lib/pos/current-store';
import { loadIpPrinterSettings } from '@/lib/settings/ip-printer-server';
import { loadReceiptSettings } from '@/lib/settings/receipt-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Config imprimante IP du POSTE courant, consommée par l'application native
 * (iOS/Android) pour router l'impression vers l'imprimante réseau.
 *
 * Résolution de la boutique, du plus fiable au repli :
 *  1. paramètre `store_id` explicite (validé) ;
 *  2. cookie `webpos_store_id` posé par la caisse (sa boutique réelle) — c'est
 *     lui qui rend l'IP déterministe même quand plusieurs boutiques existent ;
 *  3. poste appairé (cookie device) ;
 *  4. en dernier recours, première boutique accessible.
 * Sans (1)/(2), un multi-boutiques pouvait renvoyer la config d'une AUTRE
 * boutique (mauvaise imprimante / rien), d'où l'ajout du cookie caisse.
 */
export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;

  const stores = await accessibleStores(g.user);
  const inOrg = (id: string | null | undefined) =>
    id && stores.some((s) => s.id === id) ? id : null;

  const url = new URL(req.url);
  const storeId =
    inOrg(url.searchParams.get('store_id'))
    ?? inOrg(cookies().get('webpos_store_id')?.value)
    ?? (await resolveDeviceStoreId(g.user.organizationId))
    ?? stores[0]?.id
    ?? null;

  const [s, receipt] = await Promise.all([
    loadIpPrinterSettings(g.user.organizationId, storeId),
    loadReceiptSettings(g.user.organizationId, storeId),
  ]);
  // L'app native ne route vers l'IP que si la boutique est déclarée en type
  // « ip » : une boutique CloudPRNT ne bascule jamais en IP par accident, même
  // si un ancien réglage IP traîne encore.
  const configured = receipt.printer_type === 'ip' && s.enabled && s.host.trim() !== '';

  return NextResponse.json({
    configured,
    host: s.host,
    port: s.port,
    widthDots: s.width_dots,
    // Diagnostic : la boutique dont la config est renvoyée (pour vérifier qu'on
    // ne pointe pas sur une autre boutique).
    store_id: storeId,
    store_name: stores.find((st) => st.id === storeId)?.name ?? null,
  });
}
