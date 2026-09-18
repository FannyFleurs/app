'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { formatEUR } from '@/lib/services/money';

interface PreviewRow {
  line: number;
  day: string;
  store: string;
  store_id: string | null;
  ca_ttc: number | null;
  ca_ht: number | null;
  tickets: number | null;
  errors: string[];
  warnings: string[];
}
interface Coverage {
  store_id: string; store: string; days: number;
  first_day: string | null; last_day: string | null; ca_ttc: number;
}

function fmtDay(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00Z');
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR');
}

export default function RevenueHistoryClient({ canEdit }: { canEdit: boolean }) {
  const [coverage, setCoverage] = useState<Coverage[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [errorCount, setErrorCount] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadCoverage = useCallback(async () => {
    const r = await fetch('/api/analytics/revenue-history');
    if (r.ok) setCoverage((await r.json()).stores ?? []);
  }, []);
  useEffect(() => { void loadCoverage(); }, [loadCoverage]);

  async function onPick(f: File | null) {
    setFile(f); setRows(null); setMsg(null); setErr(null);
    if (!f) return;
    setBusy(true);
    try {
      const r = await fetch('/api/analytics/revenue-history/preview', { method: 'POST', body: f });
      if (!r.ok) { setErr('Lecture du fichier impossible.'); return; }
      const j = await r.json();
      setRows(j.rows); setErrorCount(j.errors); setTruncated(!!j.truncated);
    } finally { setBusy(false); }
  }

  async function commit() {
    if (!file) return;
    setBusy(true); setMsg(null); setErr(null);
    try {
      const r = await fetch('/api/analytics/revenue-history/commit', { method: 'POST', body: file });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.message ?? 'Import impossible.'); return; }
      setMsg(`${j.imported} ligne(s) importée(s)${j.skipped ? `, ${j.skipped} ignorée(s)` : ''}.`);
      setFile(null); setRows(null);
      if (inputRef.current) inputRef.current.value = '';
      await loadCoverage();
    } finally { setBusy(false); }
  }

  const validCount = rows ? rows.length - errorCount : 0;

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-4xl">
      <PageHeader
        title="Historique de CA (comparatif N-1)"
        subtitle="Importez votre chiffre d'affaires journalier par boutique pour alimenter la comparaison à l'an dernier, même sur les périodes antérieures à HelloPos."
      />

      {/* Mode d'emploi + modèle */}
      <section className="card p-5 space-y-3">
        <h2 className="font-semibold">Comment procéder</h2>
        <ol className="list-decimal pl-5 text-sm text-ink-soft space-y-1">
          <li>Téléchargez le modèle Excel (il contient déjà les noms de vos boutiques).</li>
          <li>Remplissez une ligne par jour et par boutique : date, boutique, CA TTC, CA HT (optionnel), nombre de tickets (optionnel).</li>
          <li>Déposez le fichier ci-dessous, vérifiez l&apos;aperçu, puis importez.</li>
        </ol>
        <p className="text-xs text-ink-soft">
          La boutique est reconnue par son nom. Pour un même jour et une même boutique, les
          ventes réelles enregistrées dans HelloPos restent prioritaires : l&apos;import ne
          comble que les jours sans vente.
        </p>
        <a href="/api/analytics/revenue-history/template" className="btn-soft inline-flex h-10 px-4 items-center text-sm w-fit">
          Télécharger le modèle Excel
        </a>
      </section>

      {/* Dépôt de fichier */}
      {canEdit ? (
        <section className="card p-5 space-y-3">
          <h2 className="font-semibold">Importer un fichier</h2>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
            className="block text-sm file:mr-3 file:h-10 file:px-4 file:rounded-lg file:border-0 file:bg-accent-soft file:text-accent-deep file:font-medium"
          />
          {busy && <p className="text-sm text-ink-soft">Traitement…</p>}
          {err && <p className="text-sm text-danger">{err}</p>}
          {msg && <p className="text-sm text-success">{msg}</p>}

          {rows && (
            <div className="space-y-3">
              <div className="text-sm">
                <span className="font-medium">{rows.length}</span> ligne(s) lue(s) ·{' '}
                <span className="text-success font-medium">{validCount} valide(s)</span>
                {errorCount > 0 && <> · <span className="text-danger font-medium">{errorCount} en erreur</span></>}
                {truncated && <> · <span className="text-warning">fichier tronqué à 20000 lignes</span></>}
              </div>

              <div className="max-h-[50vh] overflow-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="text-ink-soft text-xs uppercase tracking-wider bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left py-2 px-2 w-12">Ligne</th>
                      <th className="text-left py-2 px-2">Date</th>
                      <th className="text-left py-2 px-2">Boutique</th>
                      <th className="text-right py-2 px-2">CA TTC</th>
                      <th className="text-right py-2 px-2">CA HT</th>
                      <th className="text-right py-2 px-2">Tickets</th>
                      <th className="text-left py-2 px-2">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 500).map((r) => (
                      <tr key={r.line} className={`border-t border-border ${r.errors.length ? 'bg-danger/5' : ''}`}>
                        <td className="py-1.5 px-2 tabular-nums text-ink-soft">{r.line}</td>
                        <td className="py-1.5 px-2 tabular-nums whitespace-nowrap">{fmtDay(/^\d{4}-\d{2}-\d{2}$/.test(r.day) ? r.day : null) || r.day}</td>
                        <td className="py-1.5 px-2 truncate max-w-[160px]">{r.store || '—'}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">{r.ca_ttc != null && !Number.isNaN(r.ca_ttc) ? formatEUR(r.ca_ttc) : '—'}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">{r.ca_ht != null && !Number.isNaN(r.ca_ht) ? formatEUR(r.ca_ht) : '—'}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{r.tickets != null && !Number.isNaN(r.tickets) ? r.tickets : '—'}</td>
                        <td className="py-1.5 px-2 text-xs">
                          {r.errors.length > 0 ? (
                            <span className="text-danger">{r.errors.join(' · ')}</span>
                          ) : r.warnings.length > 0 ? (
                            <span className="text-warning">{r.warnings.join(' · ')}</span>
                          ) : (
                            <span className="text-success">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 500 && (
                  <div className="p-2 text-xs text-ink-soft text-center">500 premières lignes affichées sur {rows.length}.</div>
                )}
              </div>

              <button
                onClick={() => void commit()}
                disabled={busy || validCount === 0}
                className="btn-primary h-11 px-5 text-sm font-semibold disabled:opacity-50"
              >
                Importer {validCount} ligne(s) valide(s)
              </button>
            </div>
          )}
        </section>
      ) : (
        <p className="text-sm text-ink-soft">Vous n&apos;avez pas les droits pour importer des données.</p>
      )}

      {/* Couverture actuelle */}
      <section className="card p-5">
        <h2 className="font-semibold mb-3">Historique en base</h2>
        {coverage.length === 0 ? (
          <p className="text-sm text-ink-soft">Aucune boutique.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-ink-soft text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left py-1.5">Boutique</th>
                <th className="text-right py-1.5">Jours</th>
                <th className="text-right py-1.5">Du</th>
                <th className="text-right py-1.5">Au</th>
                <th className="text-right py-1.5">CA TTC cumulé</th>
              </tr>
            </thead>
            <tbody>
              {coverage.map((c) => (
                <tr key={c.store_id} className="border-t border-border">
                  <td className="py-2">{c.store}</td>
                  <td className="py-2 text-right tabular-nums">{c.days}</td>
                  <td className="py-2 text-right tabular-nums whitespace-nowrap">{fmtDay(c.first_day)}</td>
                  <td className="py-2 text-right tabular-nums whitespace-nowrap">{fmtDay(c.last_day)}</td>
                  <td className="py-2 text-right tabular-nums whitespace-nowrap">{formatEUR(c.ca_ttc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
