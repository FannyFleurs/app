import Link from 'next/link';
import { readSessionFromCookie } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';

export const dynamic = 'force-dynamic';

export default async function LoyaltyPage() {
  const user = (await readSessionFromCookie())!;

  const settings = await query<{ value: { enabled?: boolean; euros_per_point?: number; points_per_euro_discount?: number; validity_months?: number } }>(
    `SELECT value FROM settings
      WHERE organization_id = $1 AND key = 'loyalty'`,
    [user.organizationId],
  );
  const s = settings.rows[0]?.value ?? {};

  const accounts = await query<{
    customer_id: string;
    display_name: string;
    points_balance: number;
    last_movement_at: string | null;
  }>(
    `SELECT la.customer_id, la.points_balance,
            COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS display_name,
            (SELECT MAX(created_at) FROM loyalty_movements WHERE account_id = la.id) AS last_movement_at
       FROM loyalty_accounts la
       JOIN customers c ON c.id = la.customer_id
      WHERE la.organization_id = $1 AND c.is_anonymized = FALSE
      ORDER BY la.points_balance DESC LIMIT 100`,
    [user.organizationId],
  );

  const totalPoints = accounts.rows.reduce((s, a) => s + a.points_balance, 0);

  return (
    <div className="p-6 md:p-8 space-y-5">
      <PageHeader
        title="Programme fidélité"
        subtitle="Configurez vos règles de gain et d'utilisation, suivez vos adhérents."
        badge={{ label: 'Module Phase 2 — schéma actif', tone: 'soft' }}
      />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Adhérents" value={accounts.rowCount.toString()} />
        <Kpi label="Points en circulation" value={totalPoints.toLocaleString('fr-FR')} />
        <Kpi label="État du programme" value={s.enabled ? 'Actif' : 'Désactivé'} tone={s.enabled ? 'success' : undefined} />
        <Kpi label="Validité points" value={s.validity_months ? `${s.validity_months} mois` : '—'} />
      </section>

      <section className="card p-5">
        <h2 className="font-semibold mb-3">Règles de calcul</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="rounded-xl border border-border p-4">
            <div className="text-xs uppercase tracking-wider text-ink-soft">Gain</div>
            <div className="mt-2 font-medium">
              {s.euros_per_point ? `1 point tous les ${s.euros_per_point} €` : '1 € dépensé = 1 point'}
            </div>
            <p className="mt-1 text-xs text-ink-soft">Acquis à chaque vente validée.</p>
          </div>
          <div className="rounded-xl border border-border p-4">
            <div className="text-xs uppercase tracking-wider text-ink-soft">Utilisation</div>
            <div className="mt-2 font-medium">
              {s.points_per_euro_discount ? `${s.points_per_euro_discount} points = 1 € de réduction` : '100 points = 5 € de réduction'}
            </div>
            <p className="mt-1 text-xs text-ink-soft">Déduits en caisse au moment de l&apos;encaissement.</p>
          </div>
          <div className="rounded-xl border border-border p-4">
            <div className="text-xs uppercase tracking-wider text-ink-soft">Expiration</div>
            <div className="mt-2 font-medium">{s.validity_months ?? 12} mois</div>
            <p className="mt-1 text-xs text-ink-soft">Les points expirent après cette période d&apos;inactivité.</p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn-soft" disabled title="Phase 2">Modifier les règles</button>
          <button className="btn-ghost" disabled title="Phase 2">{s.enabled ? 'Désactiver' : 'Activer'} le programme</button>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft mb-2">Top adhérents</h2>
        {accounts.rowCount === 0 ? (
          <EmptyState
            icon="✦"
            title="Aucun compte fidélité actif"
            description="Les comptes sont créés automatiquement lorsqu'un client identifié réalise une vente et que le programme est activé."
          />
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg text-ink-soft text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Client</th>
                  <th className="text-right px-4 py-3">Solde</th>
                  <th className="text-left px-4 py-3">Dernier mouvement</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {accounts.rows.map((a) => (
                  <tr key={a.customer_id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/customers/${a.customer_id}`} className="hover:underline">
                        {a.display_name ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge tone="soft">{a.points_balance} pts</Badge>
                    </td>
                    <td className="px-4 py-3 text-ink-soft text-xs">
                      {a.last_movement_at ? new Date(a.last_movement_at).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/customers/${a.customer_id}`} className="text-sage-deep hover:underline text-sm">
                        Voir →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'success' }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-ink-soft">{label}</div>
      <div className={`mt-1 text-xl font-semibold tracking-tight ${tone === 'success' ? 'text-success' : ''}`}>{value}</div>
    </div>
  );
}
