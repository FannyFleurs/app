'use client';

import { useEffect, useState } from 'react';

interface Health {
  connection: { host_masked: string; pooled: boolean; ssl: boolean };
  postgres_version: string | null;
  db_bytes: number;
  db_pretty: string;
  avg_ticket_bytes: number;
  counts: Record<string, number>;
  top_tables: Array<{ name: string; bytes: number; pretty: string }>;
}

// Paliers de stockage courants (Postgres managé) pour situer la base.
const TIERS = [
  { label: 'Gratuit (~0,5 Go)', bytes: 0.5 * 1024 ** 3 },
  { label: 'Payant (~10 Go)', bytes: 10 * 1024 ** 3 },
  { label: 'Payant (~50 Go)', bytes: 50 * 1024 ** 3 },
];

const COUNT_LABELS: Record<string, string> = {
  organizations: 'Organisations',
  stores: 'Boutiques',
  users: 'Utilisateurs',
  customers: 'Clients',
  products: 'Produits',
  tickets: 'Tickets validés',
  receipts: 'Reçus',
  invoices: 'Factures',
};

export default function HealthView() {
  const [data, setData] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/admin/health', { cache: 'no-store' });
      if (!r.ok) { setError('Chargement impossible.'); return; }
      setData(await r.json());
    } catch {
      setError('Réseau indisponible.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  if (loading) return <div className="p-8 text-sm text-ink-soft">Chargement…</div>;
  if (error || !data) return <div className="p-8 text-sm text-danger">{error ?? 'Erreur.'}</div>;

  const tickets = data.counts.tickets || 0;
  // Poids RÉEL d'un ticket (mesuré serveur), et non la base entière divisée
  // par le nb de tickets — la base contient une grosse part fixe (catalogue,
  // config, système) qui ne grossit PAS avec les ventes.
  const perTicket = data.avg_ticket_bytes || 4096;

  return (
    <div className="p-8 max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Santé &amp; quota</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Volumétrie de la base et vérifications d&apos;infrastructure.
          </p>
        </div>
        <button onClick={() => void load()} className="btn-ghost text-sm">Rafraîchir</button>
      </div>

      {/* Connexion / infra */}
      <div className="card p-5">
        <h2 className="font-semibold mb-3">Connexion base de données</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <Check
            ok={data.connection.pooled}
            title="Pooler (PgBouncer)"
            good="Activé — OK pour le serverless"
            bad="ABSENT — risque de saturation des connexions"
          />
          <Check
            ok={data.connection.ssl}
            title="SSL"
            good="Chiffré (sslmode=require)"
            bad="Non forcé dans l'URL"
          />
          <div className="rounded-xl border border-border p-3">
            <div className="text-xs text-ink-soft">Serveur</div>
            <div className="font-medium truncate">{data.connection.host_masked || '—'}</div>
            <div className="text-xs text-ink-soft mt-0.5">PostgreSQL {data.postgres_version ?? '?'}</div>
          </div>
        </div>
        {!data.connection.pooled && (
          <p className="mt-3 text-xs text-danger">
            ⚠ La connexion ne semble pas passer par le pooler. En serverless,
            utilisez l&apos;URL <code>…-pooler…</code> (Neon) / PgBouncer pour
            éviter l&apos;épuisement des connexions.
          </p>
        )}
      </div>

      {/* Taille de la base + projection */}
      <div className="card p-5">
        <h2 className="font-semibold mb-1">Stockage</h2>
        <div className="text-4xl font-semibold tracking-tight tabular-nums">{data.db_pretty}</div>
        <p className="mt-1 text-sm text-ink-soft">
          {tickets.toLocaleString('fr-FR')} tickets validés
          {' · '}~{Math.max(1, Math.round(perTicket / 1024))} Ko / ticket (poids réel)
        </p>
        <p className="mt-1 text-xs text-ink-soft">
          La taille actuelle est surtout du <strong>fixe</strong> (catalogue,
          config, système) : elle ne grossit quasiment pas avec les ventes.
          Les projections ci-dessous n&apos;ajoutent que le poids réel des
          nouveaux tickets.
        </p>

        <div className="mt-4 space-y-3">
          {TIERS.map((t) => {
            const pct = Math.min(100, (data.db_bytes / t.bytes) * 100);
            const remainingTickets = perTicket > 0 ? Math.max(0, Math.floor((t.bytes - data.db_bytes) / perTicket)) : null;
            return (
              <div key={t.label}>
                <div className="flex items-baseline justify-between text-xs text-ink-soft">
                  <span>{t.label}</span>
                  <span className="tabular-nums">
                    {pct.toFixed(pct < 1 ? 2 : 1)} %
                    {remainingTickets != null && ` · ~${remainingTickets.toLocaleString('fr-FR')} tickets restants`}
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${pct > 85 ? 'bg-danger' : pct > 60 ? 'bg-warning' : ''}`}
                    style={{ width: `${Math.max(1, pct)}%`, backgroundColor: pct > 60 ? undefined : 'var(--primary)' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          Repère indicatif : les paliers dépendent de votre offre PostgreSQL réelle.
        </p>
      </div>

      {/* Volumétrie métier */}
      <div className="card p-5">
        <h2 className="font-semibold mb-3">Volumétrie</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(data.counts).map(([k, v]) => (
            <div key={k} className="rounded-xl border border-border p-3">
              <div className="text-xs text-ink-soft">{COUNT_LABELS[k] ?? k}</div>
              <div className="text-xl font-semibold tabular-nums">{v.toLocaleString('fr-FR')}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Plus grosses tables */}
      <div className="card p-5">
        <h2 className="font-semibold mb-3">Plus grosses tables</h2>
        <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
          {data.top_tables.map((t) => {
            const pct = data.db_bytes > 0 ? (t.bytes / data.db_bytes) * 100 : 0;
            return (
              <div key={t.name} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="font-mono text-xs text-ink-soft w-40 truncate">{t.name}</span>
                <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(1, pct)}%`, backgroundColor: 'var(--primary)' }} />
                </div>
                <span className="tabular-nums text-ink-soft w-20 text-right">{t.pretty}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Check({ ok, title, good, bad }: { ok: boolean; title: string; good: string; bad: string }) {
  return (
    <div className={`rounded-xl border p-3 ${ok ? 'border-success/40 bg-success/5' : 'border-danger/40 bg-danger/5'}`}>
      <div className="text-xs text-ink-soft flex items-center gap-1.5">
        <span className={ok ? 'text-success' : 'text-danger'}>{ok ? '✓' : '✕'}</span>
        {title}
      </div>
      <div className={`text-sm font-medium mt-0.5 ${ok ? 'text-success' : 'text-danger'}`}>
        {ok ? good : bad}
      </div>
    </div>
  );
}
