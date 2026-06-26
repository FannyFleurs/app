'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Stats {
  total_orgs: string;
  trial_orgs: string;
  active_orgs: string;
  cancelled_orgs: string;
  trial_expiring_soon: string;
  new_orgs_7d: string;
}

interface OrgRow {
  id: string;
  slug: string | null;
  name: string;
  legal_name: string;
  plan: string;
  trial_ends_at: string | null;
  created_at: string;
  sub_status: string | null;
  sub_plan: string | null;
  sub_period_end: string | null;
  admin_email: string | null;
  user_count: string;
  sale_count: string;
  last_sale_at: string | null;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const [s, o] = await Promise.all([
        fetch('/api/admin/stats').then((r) => r.json()).catch(() => null),
        fetch('/api/admin/organizations').then((r) => r.json()).catch(() => ({ organizations: [] })),
      ]);
      setStats(s);
      setOrgs(o.organizations ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="p-8 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard SaaS</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Vue d&apos;ensemble des comptes clients Webpos POS.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-ink-soft">Chargement…</div>
      ) : (
        <>
          <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Kpi label="Organisations" value={stats?.total_orgs ?? '0'} />
            <Kpi label="En essai" value={stats?.trial_orgs ?? '0'} />
            <Kpi label="Abonnés" value={stats?.active_orgs ?? '0'} tone="success" />
            <Kpi label="Résiliés" value={stats?.cancelled_orgs ?? '0'} />
            <Kpi label="Essai expire < 7j" value={stats?.trial_expiring_soon ?? '0'} tone="warning" />
            <Kpi label="Nouveaux (7j)" value={stats?.new_orgs_7d ?? '0'} tone="accent" />
          </section>

          <div>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-ink-soft">
                Organisations récentes
              </h2>
              <Link href="/admin/organizations" className="text-sm text-accent-deep hover:underline">
                Voir tout →
              </Link>
            </div>
            <OrgTable orgs={orgs.slice(0, 15)} />
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: {
  label: string; value: string;
  tone?: 'success' | 'warning' | 'accent';
}) {
  const cls = tone === 'success' ? 'text-success'
    : tone === 'warning' ? 'text-warning'
    : tone === 'accent' ? 'text-accent-deep'
    : '';
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-widest text-ink-soft font-semibold">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${cls}`}>{value}</div>
    </div>
  );
}

export function OrgTable({ orgs }: { orgs: OrgRow[] }) {
  if (orgs.length === 0) {
    return <div className="card p-10 text-center text-ink-soft text-sm">Aucune organisation.</div>;
  }
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="text-ink-soft text-[10px] uppercase tracking-widest border-b border-border">
          <tr>
            <th className="text-left px-4 py-3 font-semibold">Société</th>
            <th className="text-left px-4 py-3 font-semibold">Admin</th>
            <th className="text-left px-4 py-3 font-semibold">Plan</th>
            <th className="text-left px-4 py-3 font-semibold">Échéance</th>
            <th className="text-right px-4 py-3 font-semibold">Ventes</th>
            <th className="text-left px-4 py-3 font-semibold">Dernière activité</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((o) => {
            const plan = o.sub_plan ?? o.plan;
            const status = o.sub_status ?? 'active';
            const due = o.sub_period_end ?? o.trial_ends_at;
            const daysLeft = due
              ? Math.ceil((new Date(due).getTime() - Date.now()) / 86_400_000)
              : null;
            return (
              <tr key={o.id} className="border-t border-border hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/organizations/${o.id}`} className="font-medium hover:underline">
                    {o.name}
                  </Link>
                  <div className="text-[11px] text-ink-soft font-mono">{o.slug ?? '—'}</div>
                </td>
                <td className="px-4 py-3 text-ink-soft text-xs">{o.admin_email ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    plan === 'trial' ? 'bg-warning/15 text-warning'
                    : status === 'cancelled' ? 'bg-danger/15 text-danger'
                    : plan === 'enterprise' ? 'bg-accent-soft text-accent-deep'
                    : 'bg-success/15 text-success'
                  }`}>
                    {plan}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-soft text-xs">
                  {due ? (
                    <>
                      {new Date(due).toLocaleDateString('fr-FR')}
                      {daysLeft !== null && (
                        <span className={`ml-1 ${daysLeft < 7 ? 'text-warning' : 'text-ink-soft'}`}>
                          ({daysLeft >= 0 ? `${daysLeft}j` : 'expiré'})
                        </span>
                      )}
                    </>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-right text-ink-soft">{o.sale_count}</td>
                <td className="px-4 py-3 text-ink-soft text-xs">
                  {o.last_sale_at
                    ? new Date(o.last_sale_at).toLocaleDateString('fr-FR')
                    : <span className="italic">Aucune</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/organizations/${o.id}`}
                        className="text-accent-deep text-sm hover:underline">
                    Détail
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
