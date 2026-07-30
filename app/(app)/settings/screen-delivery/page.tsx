import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import { effectivePlan } from '@/lib/billing/plan-limits';
import { accessibleStores } from '@/lib/auth/stores-server';
import { resolveSettingsLockStoreId } from '@/lib/pos/current-store';
import ScreenDeliveryForm from './ScreenDeliveryForm';

export const dynamic = 'force-dynamic';

export default async function ScreenDeliverySettingsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'pos.use'))) {
    return <div className="p-8">Accès refusé.</div>;
  }

  // Fonctionnalité réservée à l'offre Croissance+ : bloquée sur Essentiel.
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
  if (plan === 'starter') {
    return (
      <div className="p-8 max-w-xl">
        <div className="card p-6">
          <h1 className="text-xl font-semibold">Écran &amp; Livraison</h1>
          <p className="mt-2 text-sm text-ink-soft">
            La commande différée (retrait à date, livraison) et l&apos;affichage
            client sont inclus dans l&apos;offre <strong>Croissance</strong>.
          </p>
          <a href="/settings/subscription" className="btn-primary mt-4 inline-flex">
            Passer à Croissance
          </a>
        </div>
      </div>
    );
  }

  const canEdit = await userCan(user, 'settings.write');
  const stores = await accessibleStores(user);
  const lockedStoreId = await resolveSettingsLockStoreId(user.organizationId);

  return <ScreenDeliveryForm canEdit={canEdit} stores={stores} lockedStoreId={lockedStoreId} />;
}
