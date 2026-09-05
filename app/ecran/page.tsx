import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import { SCREEN_DELIVERY_KEY } from '@/lib/settings/screen-delivery';
import EcranApp from './EcranApp';

export const dynamic = 'force-dynamic';

/**
 * Écran atelier — sous-domaine ecran. — application DÉDIÉE.
 *
 * Il ne vit plus dans les menus de la caisse ni du back-office : c'est un
 * écran mural, allumé en permanence dans l'atelier, que personne ne « visite »
 * depuis une autre page. On s'y connecte une fois avec l'email de
 * l'organisation, on choisit sa boutique, et il n'en bouge plus.
 */
export default async function EcranPage() {
  const user = await readSessionFromCookie();
  // Connexion par email + mot de passe, comme le back-office. Sur le
  // sous-domaine ecran., le middleware sert /bo/login ; `from` lui dit de
  // s'annoncer comme l'écran, y compris en préversion où il n'y a pas de
  // sous-domaine pour le lui apprendre.
  if (!user) redirect('/bo/login?from=ecran');

  if (!(await userCan(user, 'pos.use'))) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="card p-6 max-w-md text-sm">
          Ce compte n&apos;a pas accès à l&apos;écran atelier.
        </div>
      </div>
    );
  }

  // L'option « Écran & livraison » est un réglage AU NIVEAU ORGANISATION.
  const sd = await query<{ any: boolean }>(
    `SELECT EXISTS (
        SELECT 1 FROM settings
         WHERE organization_id = $1
           AND key = $2
           AND COALESCE((value->>'enabled')::boolean, FALSE) = TRUE
      ) AS any`,
    [user.organizationId, SCREEN_DELIVERY_KEY],
  );

  if (!(sd.rows[0]?.any ?? false)) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="card p-6 max-w-xl">
          <h1 className="font-semibold">Écran atelier désactivé</h1>
          <p className="mt-2 text-sm text-ink-soft">
            L&apos;option « Écran &amp; livraison » n&apos;est pas activée. Activez-la dans{' '}
            <Link className="underline" href="/settings/screen-delivery">les paramètres</Link>{' '}
            du back-office pour afficher les commandes et livraisons à préparer.
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

  return <EcranApp stores={stores.rows} />;
}
