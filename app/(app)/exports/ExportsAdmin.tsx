'use client';

import { useEffect, useState } from 'react';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';

interface ExportItem {
  id: string;
  period_start: string;
  period_end: string;
  format: string;
  size_bytes: string;
  sha256: string;
  created_at: string;
  generated_by: string;
}

const FORMATS = [
  { value: 'sales_csv',   label: 'Ventes — CSV' },
  { value: 'entries_csv', label: 'Écritures comptables — CSV' },
  { value: 'fec_like',    label: 'FEC-like (informatif)' },
  { value: 'json',        label: 'JSON détaillé' },
] as const;

const FORMAT_LABEL: Record<string, string> = Object.fromEntries(
  FORMATS.map((f) => [f.value, f.label]),
);

export default function ExportsAdmin() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + '01';
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo]     = useState(today);
  const [format, setFormat] = useState<typeof FORMATS[number]['value']>('sales_csv');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<ExportItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    const r = await fetch('/api/exports/accounting?list=1');
    if (r.ok) setList((await r.json()).exports ?? []);
    setLoading(false);
  }
  useEffect(() => { void reload(); }, []);

  async function generate() {
    setBusy(true); setError(null);
    const r = await fetch('/api/exports/accounting', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period_start: from, period_end: to, format }),
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur de génération');
      return;
    }
    const j = await r.json();
    // Téléchargement direct
    window.open(`/api/exports/accounting/${j.id}`, '_blank');
    void reload();
  }

  return (
    <div className="p-6 md:p-8 space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Exports comptables</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Générez des paquets pour votre expert-comptable : ventes, TVA collectée, paiements, écritures.
        </p>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-semibold">Nouvel export</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Sélectionnez une période et un format. Chaque export est signé (SHA-256) et tracé dans l&apos;audit.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-ink-soft">Du</label>
              <input type="date" className="input mt-1" value={from} max={to}
                     onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-soft">Au</label>
              <input type="date" className="input mt-1" value={to} min={from} max={today}
                     onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-ink-soft">Format</label>
              <select className="input mt-1" value={format}
                      onChange={(e) => setFormat(e.target.value as typeof format)}>
                {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </div>
          {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
          <button onClick={() => void generate()} disabled={busy} className="btn-primary mt-4 w-full">
            {busy ? 'Génération…' : 'Générer & télécharger'}
          </button>
          <p className="mt-2 text-xs text-ink-soft">
            L&apos;export FEC-like est fourni à titre informatif et ne remplace pas le FEC produit par votre comptable.
          </p>
        </div>

        <AccountsEditor />
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft mb-2">Historique des exports</h2>
        {loading ? (
          <div className="text-sm text-ink-soft">Chargement…</div>
        ) : list.length === 0 ? (
          <EmptyState icon="◇" title="Aucun export généré" />
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-ink-soft text-[10px] uppercase tracking-widest border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Période</th>
                  <th className="text-left px-4 py-3 font-semibold">Format</th>
                  <th className="text-right px-4 py-3 font-semibold">Taille</th>
                  <th className="text-left px-4 py-3 font-semibold">Auteur</th>
                  <th className="text-left px-4 py-3 font-semibold">SHA-256</th>
                  <th className="text-left px-4 py-3 font-semibold">Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-4 py-3">{e.period_start} → {e.period_end}</td>
                    <td className="px-4 py-3"><Badge tone="neutral">{FORMAT_LABEL[e.format] ?? e.format}</Badge></td>
                    <td className="px-4 py-3 text-right text-ink-soft">{formatBytes(Number(e.size_bytes))}</td>
                    <td className="px-4 py-3 text-ink-soft">{e.generated_by}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-soft">{e.sha256.slice(0, 16)}…</td>
                    <td className="px-4 py-3 text-ink-soft text-xs">
                      {new Date(e.created_at).toLocaleString('fr-FR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a href={`/api/exports/accounting/${e.id}`} target="_blank" rel="noreferrer"
                         className="text-accent-deep text-sm hover:underline">
                        Télécharger
                      </a>
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

/**
 * Editeur du plan comptable de l'organisation.
 * Chaque compte est un code numerique / alphanumerique libre —
 * l'utilisateur (ou son comptable) les cale sur son propre plan.
 */
interface Accounts {
  sales: string; tva_20: string; tva_10: string; tva_55: string; tva_21: string;
  clients: string; cash: string; bank: string; discounts: string;
}
const ACCOUNT_ROWS: Array<{ key: keyof Accounts; label: string; hint?: string }> = [
  { key: 'sales',     label: 'Ventes de marchandises',   hint: 'Compte de produit — encaissement HT' },
  { key: 'tva_20',    label: 'TVA collectée 20 %' },
  { key: 'tva_10',    label: 'TVA collectée 10 %' },
  { key: 'tva_55',    label: 'TVA collectée 5,5 %' },
  { key: 'tva_21',    label: 'TVA collectée 2,1 %' },
  { key: 'clients',   label: 'Clients (créances)',        hint: 'Utilisé pour les factures en attente de paiement' },
  { key: 'cash',      label: 'Caisse — espèces' },
  { key: 'bank',      label: 'Banque (CB, virement, chèque)' },
  { key: 'discounts', label: 'Remises accordées' },
];

function AccountsEditor() {
  const [accts, setAccts] = useState<Accounts | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await fetch('/api/settings/accounting');
      if (r.ok) setAccts((await r.json()).accounts);
    })();
  }, []);

  function patch<K extends keyof Accounts>(k: K, v: Accounts[K]) {
    setAccts((cur) => cur ? { ...cur, [k]: v } : cur);
  }

  async function submit() {
    if (!accts) return;
    setSaving(true); setSaved(false); setError(null);
    const r = await fetch('/api/settings/accounting', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(accts),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h2 className="font-semibold">Plan comptable</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Codes utilisés dans les écritures et FEC-like. Ajustez-les pour
            coller au plan comptable de votre expert-comptable.
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {accts ? ACCOUNT_ROWS.map((row) => (
          <li key={row.key} className="flex items-center gap-3 border-b border-border/60 pb-2 last:border-0">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{row.label}</div>
              {row.hint && (
                <div className="text-[11px] text-ink-soft">{row.hint}</div>
              )}
            </div>
            <input
              className="input h-10 w-32 font-mono text-sm text-right"
              value={accts[row.key]}
              maxLength={20}
              onChange={(e) => patch(row.key, e.target.value.replace(/[^A-Za-z0-9]/g, ''))}
            />
          </li>
        )) : (
          <li className="text-sm text-ink-soft">Chargement…</li>
        )}
      </ul>

      {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      {saved && <div className="mt-3 rounded-xl bg-success/10 px-3 py-2 text-sm text-success">✓ Plan comptable enregistré</div>}

      <button
        onClick={() => void submit()}
        disabled={!accts || saving}
        className="btn-primary mt-4"
      >
        {saving ? 'Enregistrement…' : 'Enregistrer le plan comptable'}
      </button>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / 1024 / 1024).toFixed(2)} Mo`;
}
