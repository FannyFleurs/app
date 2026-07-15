import Link from 'next/link';
import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import {
  SCREEN_DELIVERY_KEY,
  mergeScreenDeliveryDefaults,
  type ScreenDeliverySettings,
} from '@/lib/settings/screen-delivery';
import AtelierScreen from './AtelierScreen';

export const dynamic = 'force-dynamic';

export default async function AtelierPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'pos.use'))) {
    return <div className="p-8">Accès refusé.</div>;
  }

  const sd = await query<{ value: Partial<ScreenDeliverySettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [user.organizationId, SCREEN_DELIVERY_KEY],
  );
  const screenDelivery = mergeScreenDeliveryDefaults(sd.rows[0]?.value ?? null);

  if (!screenDelivery.enabled) {
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
