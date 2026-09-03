import { cookies } from 'next/headers';
import { readSessionFromCookie } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import CashRegister from './CashRegister';
import NoZoom from '@/components/NoZoom';
import { userCan } from '@/lib/auth/permissions';
import { CashSessionService } from '@/lib/services/cash-session-service';
import { isSharedFloat } from '@/lib/settings/cash-server';
import { loadScopedSettingValue } from '@/lib/settings/scoped-server';
import Link from 'next/link';
import {
  mergeWithDefaults,
  POS_UI_KEY,
  type PosUiSettings,
} from '@/lib/settings/pos-ui';
import {
  SCREEN_DELIVERY_KEY,
  mergeScreenDeliveryDefaults,
  type ScreenDeliverySettings,
} from '@/lib/settings/screen-delivery';

export const dynamic = 'force-dynamic';

export default async function CaissePage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'pos.use'))) {
    return (
      <div className="p-8">
        <div className="card p-6 max-w-md">
          <h1 className="font-semibold">Accès refusé</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Votre rôle ne vous donne pas accès à la caisse.
          </p>
        </div>
      </div>
    );
  }

  // Politique d'acces aux boutiques :
  // - Roles admin (super_admin/owner/manager) : toutes les boutiques actives.
  // - Autres roles : filtrees par user_store_access SI l'utilisateur a AU
  //   MOINS UNE restriction. Sans aucune restriction (cas d'un compte
  //   frais qui vient d'etre cree), on considere qu'il a acces a tout.
  //   Cela evite l'ecran "Caisse non configuree" au premier login des
  //   comptes vendeur / caisse creees sans configuration explicite.
  // Les 5 requêtes ci-dessous sont indépendantes → on les lance en parallèle
  // (un seul aller-retour groupé au lieu de 5 séquentiels).
  const [stores, registers, taxRates, posSettingsRows, screenDeliveryRows, storeTaxRows] = await Promise.all([
    query<{ id: string; code: string; name: string }>(
      `SELECT s.id, s.code, s.name FROM stores s
        WHERE s.organization_id = $2 AND s.is_active
          AND (
            $3 IN ('super_admin','owner','manager')
            OR NOT EXISTS (SELECT 1 FROM user_store_access WHERE user_id = $1)
            OR EXISTS (SELECT 1 FROM user_store_access
                        WHERE user_id = $1 AND store_id = s.id)
          )
        ORDER BY s.name`,
      [user.id, user.organizationId, user.role],
    ),
    query<{
      id: string; store_id: string; code: string; name: string;
      device_id: string | null; device_name: string | null;
    }>(
      `SELECT id, store_id, code, name, device_id, device_name FROM registers
        WHERE organization_id = $1 AND is_active = TRUE ORDER BY name`,
      [user.organizationId],
    ),
    query<{ id: string; code: string; rate: string; is_default: boolean }>(
      `SELECT id, code, rate, is_default FROM tax_rates
        WHERE organization_id = $1 AND is_active = TRUE ORDER BY rate DESC`,
      [user.organizationId],
    ),
    query<{ value: Partial<PosUiSettings> }>(
      `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
      [user.organizationId, POS_UI_KEY],
    ),
    query<{ value: Partial<ScreenDeliverySettings> }>(
      `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
      [user.organizationId, SCREEN_DELIVERY_KEY],
    ),
    // Taux TVA par défaut spécifiques à chaque boutique (clé 'tax:<storeId>').
    query<{ key: string; value: { default_code?: string | null } }>(
      `SELECT key, value FROM settings
        WHERE organization_id = $1 AND key LIKE 'tax:%'`,
      [user.organizationId],
    ),
  ]);
  const storeTaxDefaults: Record<string, string> = {};
  for (const row of storeTaxRows.rows) {
    const sid = row.key.slice('tax:'.length);
    if (sid && row.value?.default_code) storeTaxDefaults[sid] = row.value.default_code;
  }
  const posSettings = mergeWithDefaults(posSettingsRows.rows[0]?.value ?? null);
  const screenDelivery = mergeScreenDeliveryDefaults(screenDeliveryRows.rows[0]?.value ?? null);

  if (stores.rows.length === 0 || registers.rows.length === 0) {
    return (
      <div className="p-8">
        <div className="card p-6 max-w-xl">
          <h1 className="font-semibold">Caisse non configurée</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Aucune boutique ou caisse active n&apos;est rattachée à votre compte.
            Demandez à un administrateur d&apos;en créer une dans les{' '}
            <Link className="underline" href="/settings">Paramètres</Link>.
          </p>
        </div>
      </div>
    );
  }

  // Seed initial CÔTÉ SERVEUR : on résout le poste (cookie device → caisse
  // appairée) et sa session ouverte, pour que le 1er rendu affiche déjà la
  // caisse (sans « Chargement caisse… » dépendant d'un fetch client qui, sur
  // certains contextes iOS PWA, ne se peignait qu'après un contact).
  const deviceId = cookies().get('webpos_device_id')?.value ?? null;
  const bound = deviceId ? registers.rows.find((r) => r.device_id === deviceId) : undefined;
  let initial: { deviceId: string; storeId: string; registerId: string; sessionId: string | null } | null = null;
  if (deviceId && bound) {
    // Résolution IDENTIQUE au client (GET /api/cash-sessions) : en fonds commun
    // la session ouverte de la boutique fait foi, quel que soit le poste qui l'a
    // ouverte. Un seed par `register_id` seul afficherait « caisse fermée » sur
    // un poste ayant rejoint le fonds d'un autre poste.
    const shared = await isSharedFloat(user.organizationId, bound.store_id);
    const sessionId = await CashSessionService.resolveOpenSessionId({
      storeId: bound.store_id,
      registerId: bound.id,
      shared,
    });
    initial = { deviceId, storeId: bound.store_id, registerId: bound.id, sessionId };
  }

  // Valeur « Écran & Livraison » RÉSOLUE POUR LA BOUTIQUE du poste appairé, pour
  // que le bouton « Commande / Livraison » soit au bon état dès le 1er rendu.
  // Sans ça, on partait de la valeur au niveau organisation puis on corrigeait
  // par boutique côté client : le bouton clignotait (apparaît puis disparaît)
  // quand l'option est décochée pour la boutique.
  let deferredSeed = screenDelivery.enabled;
  if (bound) {
    const scoped = await loadScopedSettingValue<ScreenDeliverySettings>(
      user.organizationId, SCREEN_DELIVERY_KEY, bound.store_id,
    );
    deferredSeed = mergeScreenDeliveryDefaults(scoped).enabled;
  }

  return (
    <>
      {/* Verrou de zoom monté au niveau de la PAGE : la caisse a plusieurs
          écrans avant la grille (choix du poste, ouverture de caisse), et le
          poser plus bas les laissait tous zoomables. */}
      <NoZoom />
      <CashRegister
      stores={stores.rows}
      registers={registers.rows}
      taxRates={taxRates.rows.map((t) => ({ ...t, rate: Number(t.rate) }))}
      storeTaxDefaults={storeTaxDefaults}
      currentUser={{ id: user.id, name: user.fullName, role: user.role }}
      posUi={posSettings}
      deferredOrdersEnabled={deferredSeed}
      initial={initial}
      />
    </>
  );
}
