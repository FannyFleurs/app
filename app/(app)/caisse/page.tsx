import { readSessionFromCookie } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import CashRegister from './CashRegister';
import { userCan } from '@/lib/auth/permissions';
import Link from 'next/link';
import {
  mergeWithDefaults,
  POS_UI_KEY,
  type PosUiSettings,
} from '@/lib/settings/pos-ui';

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
  const stores = await query<{ id: string; code: string; name: string }>(
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
  );
  const registers = await query<{ id: string; store_id: string; code: string; name: string }>(
    `SELECT id, store_id, code, name FROM registers
      WHERE organization_id = $1 AND is_active = TRUE ORDER BY name`,
    [user.organizationId],
  );
  const taxRates = await query<{ id: string; code: string; rate: string; is_default: boolean }>(
    `SELECT id, code, rate, is_default FROM tax_rates
      WHERE organization_id = $1 AND is_active = TRUE ORDER BY rate DESC`,
    [user.organizationId],
  );

  const posSettingsRows = await query<{ value: Partial<PosUiSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [user.organizationId, POS_UI_KEY],
  );
  const posSettings = mergeWithDefaults(posSettingsRows.rows[0]?.value ?? null);

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

  return (
    <CashRegister
      stores={stores.rows}
      registers={registers.rows}
      taxRates={taxRates.rows.map((t) => ({ ...t, rate: Number(t.rate) }))}
      currentUser={{ id: user.id, name: user.fullName, role: user.role }}
      posUi={posSettings}
    />
  );
}
