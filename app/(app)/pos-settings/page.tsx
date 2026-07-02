import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import {
  mergeWithDefaults,
  POS_UI_KEY,
  type PosUiSettings,
} from '@/lib/settings/pos-ui';
import PageHeader from '@/components/PageHeader';
import POSSettingsForm from './POSSettingsForm';

export const dynamic = 'force-dynamic';

export default async function POSSettingsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'pos.use'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const canWrite = (await userCan(user, 'pos.settings.write'));

  const { rows } = await query<{ value: Partial<PosUiSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [user.organizationId, POS_UI_KEY],
  );
  const initial = mergeWithDefaults(rows[0]?.value ?? null);

  return (
    <div className="p-8 space-y-5">
      <PageHeader
        title="Paramètres caisse"
        subtitle="Personnalisez l'interface de vente. Vos réglages sont enregistrés au niveau de votre organisation et appliqués sur toutes les caisses."
        badge={!canWrite ? { label: 'Lecture seule pour votre rôle', tone: 'soft' } : undefined}
      />
      <POSSettingsForm initial={initial} canWrite={canWrite} />
    </div>
  );
}
