import Link from 'next/link';
import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import { SCREEN_DELIVERY_KEY } from '@/lib/settings/screen-delivery';
import AtelierScreen from './AtelierScreen';

export const dynamic = 'force-dynamic';

export default async function AtelierPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'pos.use'))) {
    return <div className="p-8">Accès refusé.</div>;
  }

  // Écran atelier accessible dès que l'option est activée pour l'organisation
  // OU pour au moins une boutique (réglages désormais par boutique :
  // clés `screen_delivery` et `screen_delivery:<storeId>`).
  const sd = await query<{ any: boolean }>(
    `SELECT EXISTS (
        SELECT 1 FROM settings
         WHERE organization_id = $1
           AND (key = $2 OR key LIKE $2 || ':%')
           AND COALESCE((value->>'enabled')::boolean, FALSE) = TRUE
      ) AS any`,
    [user.organizationId, SCREEN_DELIVERY_KEY],
  );
  const anyEnabled = sd.rows[0]?.any ?? false;

  if (!anyEnabled) {
    return (
      <div className="p-8">
        <div className="card p-6 max-w-xl">
          <h1 className="font-semibold">Écran atelier désactivé</h1>
          <p className="mt-2 text-sm text-ink-soft">
            L&apos;option « Écran &amp; livraison » n&apos;est pas activée. Activez-la dans{' '}
            <Link className="underline" href="/settings/screen-delivery">les paramètres</Link>{' '}
            pour afficher les commandes et livraisons à préparer.
          </p>
        </div>
      </div>
    );
  }

  const stores = await query<{ id: string; name: string }>(
    `SELECT id, name FROM stores
      WHERE organization_id = $1 AND is_active = TRUE ORDER BY name`,
    [user.organizationId],
  );

  return <AtelierScreen stores={stores.rows} />;
}
