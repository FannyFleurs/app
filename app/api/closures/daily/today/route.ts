import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { accessibleStores, storeInOrg } from '@/lib/auth/stores-server';
import { resolveDeviceStoreId } from '@/lib/pos/current-store';

/**
 * La journée est-elle clôturée, POUR UNE BOUTIQUE ?
 *
 * Cette route agrégeait `MAX(sealed_at)` sur toute l'organisation. Clôturer
 * Alençon affichait donc « Journée clôturée » sur la caisse de Mortagne, dont
 * la journée était pourtant ouverte : le bandeau passait en « Clôturée », et
 * le bouton « Clôturer la journée » se changeait en « réouvrir / réimprimer le
 * Z ». Un poste ne doit connaître que sa propre journée.
 *
 * Sans `store_id`, on prend la boutique du POSTE — même résolution que le
 * rapport X (`/api/reports/day`), pour que les deux ne puissent pas parler de
 * deux boutiques différentes sur le même écran.
 */
export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  const date = url.searchParams.get('date');
  if (!date) return NextResponse.json({ sealed_at: null, store_id: null });

  let storeId = url.searchParams.get('store_id');
  if (storeId) {
    if (!(await storeInOrg(storeId, g.user.organizationId))) {
      return NextResponse.json({ error: 'STORE_NOT_FOUND' }, { status: 400 });
    }
  } else {
    storeId = (await resolveDeviceStoreId(g.user.organizationId))
      ?? (await accessibleStores(g.user))[0]?.id
      ?? null;
  }
  // Aucune boutique résolue : on ne prétend pas que la journée est clôturée.
  if (!storeId) return NextResponse.json({ sealed_at: null, store_id: null });

  const [sealedQ, openQ] = await Promise.all([
    query<{ sealed_at: string }>(
      `SELECT MAX(sealed_at) AS sealed_at
         FROM daily_closures
        WHERE organization_id = $1 AND store_id = $2 AND business_date = $3::date`,
      [g.user.organizationId, storeId, date],
    ),
    // Journée ROUVERTE : après un scellé, si une caisse a été rouverte (session
    // « open »), la journée n'est plus fermée du point de vue de la caisse et de
    // Ma journée. Sans ça, elle restait « clôturée » et redemandait sans cesse la
    // réouverture, la réouverture ne « prenant » jamais.
    query(
      `SELECT 1 FROM cash_sessions
        WHERE organization_id = $1 AND store_id = $2 AND status = 'open'
        LIMIT 1`,
      [g.user.organizationId, storeId],
    ),
  ]);
  const reopened = (openQ.rowCount ?? 0) > 0;
  const sealed_at = reopened ? null : (sealedQ.rows[0]?.sealed_at ?? null);
  // La boutique réellement interrogée est renvoyée : l'écran peut vérifier
  // qu'il parle bien de celle qu'il affiche.
  return NextResponse.json({ sealed_at, store_id: storeId, reopened });
}
