'use client';

import { useEffect, useState } from 'react';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import { ALL_FORMATS } from '@/lib/settings/export-formats';

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

// L'historique peut contenir des exports d'un format depuis désactivé : son
// libellé doit rester lisible, sinon une vieille ligne devient une énigme.
const FORMAT_LABEL: Record<string, string> = Object.fromEntries(
  ALL_FORMATS.map((f) => [f.value, f.label]),
);

/** Historique des exports générés, avec téléchargement de chaque paquet. */
export default function ExportHistory() {
  const [list, setList] = useState<ExportItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const r = await fetch('/api/exports/accounting?list=1');
      if (r.ok) setList((await r.json()).exports ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft mb-2">Historique des exports</h2>
      {loading ? (
        <div className="text-sm text-ink-soft">Chargement…</div>
      ) : list.length === 0 ? (
        <EmptyState icon="◇" title="Aucun export généré" />
      ) : (
        // `overflow-hidden` coupait net les six colonnes sur téléphone :
        // « Télécharger » devenait inatteignable. On laisse défiler.
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[48rem]">
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
                  <td className="px-4 py-3 whitespace-nowrap">{e.period_start} → {e.period_end}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><Badge tone="neutral">{FORMAT_LABEL[e.format] ?? e.format}</Badge></td>
                  <td className="px-4 py-3 text-right text-ink-soft">{formatBytes(Number(e.size_bytes))}</td>
                  <td className="px-4 py-3 text-ink-soft whitespace-nowrap">{e.generated_by}</td>
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
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / 1024 / 1024).toFixed(2)} Mo`;
}
