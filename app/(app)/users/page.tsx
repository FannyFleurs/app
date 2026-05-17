import { readSessionFromCookie } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import { query } from '@/lib/db/client';
import { ROLE_LABELS } from '@/components/labels';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const user = (await readSessionFromCookie())!;
  if (!hasPermission(user.role, 'users.read')) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const users = await query<{
    id: string; email: string; full_name: string; role: keyof typeof ROLE_LABELS;
    is_active: boolean; last_login_at: string | null;
  }>(
    `SELECT id, email, full_name, role, is_active, last_login_at
       FROM users WHERE organization_id = $1 ORDER BY full_name`,
    [user.organizationId],
  );

  return (
    <div className="p-8 space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Utilisateurs</h1>
      <p className="text-sm text-ink-soft">
        La création / modification des utilisateurs sera disponible dans une phase ultérieure.
        En attendant, créez vos utilisateurs via le script de seed.
      </p>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg text-ink-soft text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Nom</th>
              <th className="text-left px-4 py-3">Email</th>
              <th className="text-left px-4 py-3">Rôle</th>
              <th className="text-left px-4 py-3">Dernière connexion</th>
              <th className="text-center px-4 py-3">Actif</th>
            </tr>
          </thead>
          <tbody>
            {users.rows.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{u.full_name}</td>
                <td className="px-4 py-3 text-ink-soft">{u.email}</td>
                <td className="px-4 py-3">{ROLE_LABELS[u.role]}</td>
                <td className="px-4 py-3 text-ink-soft">
                  {u.last_login_at ? new Date(u.last_login_at).toLocaleString('fr-FR') : '—'}
                </td>
                <td className="px-4 py-3 text-center">{u.is_active ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
