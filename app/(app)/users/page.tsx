import { readSessionFromCookie } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import { query } from '@/lib/db/client';
import { ROLE_LABELS } from '@/components/labels';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const user = (await readSessionFromCookie())!;
  if (!hasPermission(user.role, 'users.read')) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const users = await query<{
    id: string; email: string; full_name: string;
    role: keyof typeof ROLE_LABELS;
    is_active: boolean; twofa_enabled: boolean;
    last_login_at: string | null; created_at: string;
  }>(
    `SELECT id, email, full_name, role, is_active, twofa_enabled, last_login_at, created_at
       FROM users WHERE organization_id = $1 ORDER BY full_name`,
    [user.organizationId],
  );

  return (
    <div className="p-8 space-y-5">
      <PageHeader
        title="Utilisateurs"
        subtitle="Comptes rattachés à votre organisation. Sept rôles disponibles avec permissions granulaires."
        actions={(
          <button className="btn-primary" disabled title="Phase 4">+ Inviter un utilisateur</button>
        )}
      />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total" value={users.rowCount.toString()} />
        <Kpi label="Actifs" value={users.rows.filter((u) => u.is_active).length.toString()} />
        <Kpi label="Avec 2FA" value={users.rows.filter((u) => u.twofa_enabled).length.toString()} />
        <Kpi label="Connectés (7j)" value={users.rows.filter((u) =>
          u.last_login_at && (Date.now() - new Date(u.last_login_at).getTime()) < 7 * 86400_000,
        ).length.toString()} />
      </section>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg text-ink-soft text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Nom</th>
              <th className="text-left px-4 py-3">Email</th>
              <th className="text-left px-4 py-3">Rôle</th>
              <th className="text-center px-4 py-3">2FA</th>
              <th className="text-left px-4 py-3">Dernière connexion</th>
              <th className="text-center px-4 py-3">État</th>
            </tr>
          </thead>
          <tbody>
            {users.rows.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{u.full_name}</td>
                <td className="px-4 py-3 text-ink-soft">{u.email}</td>
                <td className="px-4 py-3"><Badge tone="soft">{ROLE_LABELS[u.role]}</Badge></td>
                <td className="px-4 py-3 text-center">
                  {u.twofa_enabled ? <Badge tone="success">Activée</Badge> : <span className="text-ink-soft text-xs">—</span>}
                </td>
                <td className="px-4 py-3 text-ink-soft text-xs">
                  {u.last_login_at ? new Date(u.last_login_at).toLocaleString('fr-FR') : 'Jamais'}
                </td>
                <td className="px-4 py-3 text-center">
                  {u.is_active ? <Badge tone="success">Actif</Badge> : <Badge tone="danger">Désactivé</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card p-5">
        <h2 className="font-semibold">Rôles & permissions</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Florea s&apos;appuie sur 7 rôles préconfigurés avec des permissions granulaires.
          Aucun rôle ne peut supprimer une vente validée (l&apos;annulation passe par un avoir).
        </p>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(ROLE_LABELS).map(([key, label]) => (
            <div key={key} className="rounded-xl border border-border p-4">
              <div className="font-medium">{label}</div>
              <div className="mt-1 text-xs text-ink-soft">{ROLE_DESC[key as keyof typeof ROLE_LABELS]}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const ROLE_DESC: Record<keyof typeof ROLE_LABELS, string> = {
  super_admin: 'Accès total cross-organisations.',
  owner: 'Tous droits sur l\'organisation, y compris clôtures annuelles et utilisateurs.',
  manager: 'Caisse, produits, clôtures journalières, override prix.',
  vendeur: 'Caisse + ajout client. Pas d\'override prix sans manager.',
  comptable: 'Lecture CRM, conformité fiscale, exports comptables.',
  lecture_seule: 'Lecture des données opérationnelles.',
  support_technique: 'Accès restreint, journalisé, pour intervention support.',
};

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-ink-soft">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}
