import { readSessionFromCookie } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import CashRegister from './CashRegister';
import { hasPermission } from '@/lib/auth/rbac';
import Link from 'next/link';
import {
  mergeWithDefaults,
  POS_UI_KEY,
  type PosUiSettings,
} from '@/lib/settings/pos-ui';

export const dynamic = 'force-dynamic';

export default async function CaissePage() {
  const user = (await readSessionFromCookie())!;
  if (!hasPermission(user.role, 'pos.use')) {
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

  const stores = await query<{ id: string; code: string; name: string }>(
    `SELECT s.id, s.code, s.name FROM stores s
       LEFT JOIN user_store_access usa ON usa.store_id = s.id AND usa.user_id = $1
      WHERE s.organization_id = $2 AND s.is_active
        AND ($3 IN ('super_admin','owner','manager') OR usa.user_id IS NOT NULL)
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
