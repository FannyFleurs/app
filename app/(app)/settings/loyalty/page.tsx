import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import { effectivePlan } from '@/lib/billing/plan-limits';
import {
  mergeWithDefaults,
  POS_UI_KEY,
  type PosUiSettings,
} from '@/lib/settings/pos-ui';
import LoyaltySettingsForm from './LoyaltySettingsForm';

export const dynamic = 'force-dynamic';

export default async function LoyaltySettingsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'pos.use'))) {
    return <div className="p-8">Accès refusé.</div>;
  }

  const { rows } = await query<{ value: Partial<PosUiSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [user.organizationId, POS_UI_KEY],
  );
  const settings = mergeWithDefaults(rows[0]?.value ?? null);
  const canEdit = (await userCan(user, 'settings.write'));

  // Boutiques actives (pour le périmètre multi-boutiques).
  const stores = await query<{ id: string; name: string }>(
    `SELECT id, name FROM stores
      WHERE organization_id = $1 AND is_active = TRUE ORDER BY name`,
    [user.organizationId],
  );

  // Le périmètre multi-boutiques est une fonctionnalité Croissance+ (pas
  // Essentiel). On calcule l'offre effective.
  let plan = 'trial';
  try {
    const p = await query<{ sub_plan: string | null; org_plan: string | null }>(
      `SELECT s.plan AS sub_plan, o.plan AS org_plan
         FROM organizations o LEFT JOIN subscriptions s ON s.organization_id = o.id
        WHERE o.id = $1`,
      [user.organizationId],
    );
    plan = effectivePlan(p.rows[0]?.sub_plan ?? null, p.rows[0]?.org_plan ?? null);
  } catch { /* défaut trial */ }
  const scopeAvailable = plan !== 'starter';

  return (
    <LoyaltySettingsForm
      initial={settings}
      canEdit={canEdit}
      stores={stores.rows}
      scopeAvailable={scopeAvailable}
    />
  );
}
