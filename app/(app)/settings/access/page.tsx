import Link from 'next/link';
import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import {
  mergeWithDefaults,
  POS_UI_KEY,
  type PosUiSettings,
} from '@/lib/settings/pos-ui';
import PageHeader from '@/components/PageHeader';
import AccessForm from './AccessForm';

export const dynamic = 'force-dynamic';

export default async function AccessPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'settings.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const canWrite = (await userCan(user, 'settings.write'));

  const { rows } = await query<{ value: Partial<PosUiSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [user.organizationId, POS_UI_KEY],
  );
  const ui = mergeWithDefaults(rows[0]?.value ?? null);

  return (
    <div className="p-6 md:p-8 space-y-5 max-w-3xl">
      <Link href="/settings" className="text-sm text-ink-soft hover:text-ink">← Paramètres</Link>
      <PageHeader
        title="Gestion d'accès"
        subtitle="Activez ou masquez chaque entrée de la sidebar pour toute l'organisation."
        badge={!canWrite ? { label: 'Lecture seule pour votre rôle', tone: 'soft' } : undefined}
      />
      <AccessForm initialHiddenPaths={ui.hidden_sidebar_paths ?? []} canWrite={canWrite} role={user.role} />
    </div>
  );
}
