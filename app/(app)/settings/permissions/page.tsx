import Link from 'next/link';
import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import PageHeader from '@/components/PageHeader';
import RolePermissionsAdmin from './RolePermissionsAdmin';

export const dynamic = 'force-dynamic';

export default async function PermissionsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'settings.write'))) {
    return <div className="p-8">Accès refusé : seul un administrateur peut éditer les permissions.</div>;
  }

  return (
    <div className="p-4 md:p-8 space-y-5 max-w-5xl">
      <Link href="/settings" className="text-sm text-ink-soft hover:text-ink md:hidden">← Paramètres</Link>
      <PageHeader
        title="Permissions par rôle"
        subtitle="Activez ou désactivez chaque action par rôle. Les valeurs par défaut sont héritées du système ; vous pouvez les surcharger ici pour toute l'organisation. Pour un utilisateur précis, utilisez « Permissions individuelles » sur sa fiche."
      />
      <RolePermissionsAdmin />
    </div>
  );
}
