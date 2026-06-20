'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import { formatEUR } from '@/lib/services/money';

interface Customer {
  id: string;
  type: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  siret: string | null;
  nb_sales: string;
  last_visit: string | null;
  total_ttc: string;
  loyalty_points: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  particulier: 'Particulier',
  professionnel: 'Pro',
  collectivite: 'Collectivité',
  association: 'Association',
};

export default function CustomersList({ customers, canWrite }: { customers: Customer[]; canWrite: boolean }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | string>('all');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return customers.filter((c) => {
      if (type !== 'all' && c.type !== type) return false;
      if (!needle) return true;
      return (
        c.display_name?.toLowerCase().includes(needle) ||
        c.email?.toLowerCase().includes(needle) ||
        c.phone?.includes(needle) ||
        c.company_name?.toLowerCase().includes(needle) ||
        c.siret?.includes(needle)
      );
    });
  }, [customers, q, type]);

  return (
    <div className="p-8 space-y-5">
      <PageHeader
        title="Clients"
        subtitle="Particuliers, professionnels, collectivités et associations rattachés à votre organisation."
        actions={canWrite ? (
          <button className="btn-primary" disabled title="Disponible en Phase 2">
            + Nouveau client
          </button>
        ) : null}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Kpi label="Clients" value={customers.length.toString()} />
        <Kpi label="Pros & assoc." value={customers.filter((c) => c.type !== 'particulier').length.toString()} />
        <Kpi label="CA cumulé" value={formatEUR(customers.reduce((s, c) => s + Number(c.total_ttc), 0))} />
        <Kpi label="Avec fidélité" value={customers.filter((c) => c.loyalty_points).length.toString()} />
      </div>

      <div className="card p-3 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-md"
          placeholder="Rechercher par nom, email, téléphone, SIRET…"
          value={q} onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex gap-1 ml-auto">
          {(['all', 'particulier', 'professionnel', 'collectivite', 'association'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                type === t ? 'bg-sage text-white border-sage' : 'bg-white text-ink border-border hover:border-sage/40'
              }`}
            >
              {t === 'all' ? 'Tous' : TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="◉"
          title={customers.length === 0 ? 'Aucun client enregistré' : 'Aucun résultat'}
          description={customers.length === 0
            ? "Les clients sont créés depuis la caisse à l'encaissement ou via la fiche client."
            : "Aucun client ne correspond aux filtres actifs."}
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg text-ink-soft text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Client</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Contact</th>
                <th className="text-right px-4 py-3">Achats</th>
                <th className="text-right px-4 py-3">CA cumulé</th>
                <th className="text-right px-4 py-3">Fidélité</th>
                <th className="text-left px-4 py-3">Dernière visite</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-bg/60 cursor-pointer"
                    onClick={() => (window.location.href = `/customers/${c.id}`)}>
                  <td className="px-4 py-3">
                    <Link href={`/customers/${c.id}`} className="font-medium hover:underline">
                      {c.display_name || '—'}
                    </Link>
                    {c.company_name && c.company_name !== c.display_name && (
                      <div className="text-xs text-ink-soft">{c.company_name}</div>
                    )}
                  </td>
                  <td className="px-4 py-3"><Badge tone="neutral">{TYPE_LABEL[c.type] ?? c.type}</Badge></td>
                  <td className="px-4 py-3 text-ink-soft text-xs">
                    {c.email && <div>{c.email}</div>}
                    {c.phone && <div>{c.phone}</div>}
                  </td>
                  <td className="px-4 py-3 text-right">{c.nb_sales}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatEUR(Number(c.total_ttc))}</td>
                  <td className="px-4 py-3 text-right">
                    {c.loyalty_points ? <Badge tone="soft">{c.loyalty_points} pts</Badge> : <span className="text-ink-soft">—</span>}
                  </td>
                  <td className="px-4 py-3 text-ink-soft text-xs">
                    {c.last_visit ? new Date(c.last_visit).toLocaleDateString('fr-FR') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-ink-soft">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}
