'use client';
import { confirmThemed } from '@/lib/ui/dialog';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import Badge from '@/components/Badge';

interface Inventory {
  id: string; label: string; store_id: string; store_name: string;
  scope_type: 'total' | 'category' | 'supplier'; scope_ids: string[];
  status: 'in_progress' | 'in_review' | 'finalized' | 'cancelled';
  created_at: string; finalized_at: string | null;
}
interface Line {
  id: string; product_id: string; product_name: string;
  sku: string | null; barcode: string | null;
  category_name: string | null; supplier_ref: string | null;
  expected_qty: string; counted_qty: string;
  purchase_price_ht: string | null;
}
interface FinalizeReport {
  positive_count: number; negative_count: number;
  positive_value: number; negative_value: number;
  movements: Array<{ product_name: string; delta: number; value: number }>;
}

export default function InventoryDetail({ inventoryId }: { inventoryId: string }) {
  const [inv, setInv] = useState<Inventory | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);
  const [scan, setScan] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showFinalizedReport, setShowFinalizedReport] = useState<FinalizeReport | null>(null);
  const [filter, setFilter] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);

  async function reload() {
    setLoading(true);
    const r = await fetch(`/api/inventories/${inventoryId}`);
    if (r.ok) {
      const j = await r.json() as { inventory: Inventory; lines: Line[] };
      setInv(j.inventory);
      setLines(j.lines);
    }
    setLoading(false);
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, []);

  const status = inv?.status ?? 'in_progress';
  const isReviewing = status === 'in_review';
  const isFinalized = status === 'finalized';
  const isCancelled = status === 'cancelled';
  const locked = isFinalized || isCancelled;

  // En phase d'inventaire (in_progress) : on montre TOUT.
  // En phase de revue : uniquement les ecarts.
  const visibleLines = useMemo(() => {
    const src = isReviewing
      ? lines.filter((l) => Number(l.counted_qty) !== Number(l.expected_qty))
      : lines;
    if (!filter.trim()) return src;
    const q = filter.trim().toLowerCase();
    return src.filter((l) =>
      l.product_name.toLowerCase().includes(q)
      || l.sku?.toLowerCase().includes(q)
      || l.barcode?.toLowerCase().includes(q),
    );
  }, [lines, isReviewing, filter]);

  const kpi = useMemo(() => {
    let pos = 0, neg = 0, posVal = 0, negVal = 0;
    for (const l of lines) {
      const d = Number(l.counted_qty) - Number(l.expected_qty);
      if (d === 0) continue;
      const v = d * Number(l.purchase_price_ht ?? 0);
      if (d > 0) { pos++; posVal += v; }
      else { neg++; negVal += v; }
    }
    return {
      total: lines.length,
      counted: lines.filter((l) => Number(l.counted_qty) > 0).length,
      deltas: pos + neg,
      pos, neg,
      posVal: Number(posVal.toFixed(2)),
      negVal: Number(negVal.toFixed(2)),
    };
  }, [lines]);

  async function submitScan(e: React.FormEvent) {
    e.preventDefault();
    const code = scan.trim();
    if (!code || scanBusy || locked) return;
    setScanBusy(true); setErr(null); setFeedback(null);
    try {
      const r = await fetch(`/api/inventories/${inventoryId}/scan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, delta: 1 }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(prettyError(j.error, j.message));
        return;
      }
      const j = await r.json() as {
        line: { product_name: string; counted_qty: string };
      };
      setFeedback(`✓ ${j.line.product_name} — ${Number(j.line.counted_qty)} compté(s)`);
      setScan('');
      await reload();
      setTimeout(() => setFeedback(null), 2500);
    } finally {
      setScanBusy(false);
      scanRef.current?.focus();
    }
  }

  async function patchCount(lineId: string, counted_qty: number) {
    if (locked) return;
    const r = await fetch(`/api/inventories/${inventoryId}/lines/${lineId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ counted_qty }),
    });
    if (r.ok) await reload();
  }

  async function goReview() {
    if (!(await confirmThemed({ message: 'Passer à la phase de pointage ?\n\nSeules les lignes avec écart resteront visibles pour correction manuelle.' }))) return;
    const r = await fetch(`/api/inventories/${inventoryId}/review`, { method: 'POST' });
    if (r.ok) await reload();
    else {
      const j = await r.json().catch(() => ({}));
      setErr(j.error ?? 'Erreur');
    }
  }

  async function finalize() {
    if (!(await confirmThemed({ message: 'Valider définitivement l\'inventaire ?\n\nLes mouvements de stock (+ / -) vont être enregistrés. Cette action est irréversible.' }))) return;
    const r = await fetch(`/api/inventories/${inventoryId}/finalize`, { method: 'POST' });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setErr(j.error ?? 'Erreur');
      return;
    }
    const report = await r.json() as FinalizeReport;
    setShowFinalizedReport(report);
    await reload();
  }

  async function cancelInventory() {
    if (!(await confirmThemed({ message: 'Annuler cet inventaire ?\n\nAucun mouvement de stock ne sera enregistré.' }))) return;
    const r = await fetch(`/api/inventories/${inventoryId}/cancel`, { method: 'POST' });
    if (r.ok) await reload();
  }

  /**
   * Le PDF est rendu par le serveur, pas capturé à l'écran : `window.print()`
   * imprimait la page telle quelle — champs de saisie compris, colonnes
   * coupées à la largeur du navigateur, sans reprise d'en-tête d'une page à
   * l'autre. Ici c'est un vrai document, paginé, qu'on peut archiver.
   */
  function printReview() {
    window.open(`/api/inventories/${inventoryId}/discrepancies-pdf`, '_blank');
  }

  if (loading || !inv) {
    return <div className="p-8 text-sm text-ink-soft">Chargement…</div>;
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 w-full print:p-0">
      <div className="flex items-start justify-between gap-4 mb-5 print:hidden">
        <div>
          <Link href="/inventory" className="text-sm text-ink-soft hover:text-ink">← Inventaires</Link>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">{inv.label}</h1>
          <p className="text-sm text-ink-soft mt-0.5">
            {inv.store_name} · Créé le {new Date(inv.created_at).toLocaleString('fr-FR')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 print:hidden">
        <Kpi label="Lignes"       value={kpi.total.toString()} />
        <Kpi label="Comptées"     value={`${kpi.counted} / ${kpi.total}`} />
        <Kpi label="Surplus"      value={kpi.pos.toString()}
             extra={kpi.posVal !== 0 ? `+${formatEUR(kpi.posVal)}` : undefined}
             tone="success" />
        <Kpi label="Manquants"    value={kpi.neg.toString()}
             extra={kpi.negVal !== 0 ? formatEUR(kpi.negVal) : undefined}
             tone="danger" />
      </div>

      {/* Barre de scan (seulement en phase de comptage) */}
      {status === 'in_progress' && (
        <form onSubmit={submitScan} className="card p-4 mb-4 print:hidden">
          <label className="text-xs font-medium text-ink-soft">
            Scanner un produit (code-barres / SKU)
          </label>
          <div className="mt-1 flex gap-2">
            <input
              ref={scanRef}
              autoFocus
              className="input flex-1 h-12 text-base font-mono"
              placeholder="Douchette ou saisie manuelle…"
              value={scan}
              onChange={(e) => setScan(e.target.value)}
            />
            <button
              type="submit"
              disabled={scanBusy || !scan.trim()}
              className="btn-primary h-12 text-base font-semibold px-5"
            >
              +1
            </button>
          </div>
          {feedback && (
            <div className="mt-2 text-sm text-success">{feedback}</div>
          )}
          {err && (
            <div className="mt-2 text-sm text-danger">{err}</div>
          )}
        </form>
      )}

      {/* Filtre */}
      {(status === 'in_progress' || status === 'in_review') && lines.length > 0 && (
        <div className="mb-3 print:hidden">
          <input
            className="input h-11 text-base"
            placeholder="Filtrer par nom, SKU, code-barres…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      )}

      {/* En-tete imprimable en phase de revue */}
      {isReviewing && (
        <div className="hidden print:block mb-4">
          <h1 className="text-xl font-bold">{inv.label} — Liste à pointer</h1>
          <p className="text-sm text-ink-soft">
            {inv.store_name} · Créé le {new Date(inv.created_at).toLocaleString('fr-FR')}
          </p>
          <p className="text-sm">{visibleLines.length} ligne(s) avec écart</p>
        </div>
      )}

      {/* Liste des lignes */}
      {visibleLines.length === 0 ? (
        <div className="card p-8 text-center text-ink-soft text-sm">
          {isReviewing
            ? '✓ Aucun écart. Vous pouvez valider l\'inventaire.'
            : 'Aucune ligne à afficher.'}
        </div>
      ) : (
        // Défilement plutôt que coupe : en `overflow-hidden`, les dernières
        // colonnes disparaissaient sans recours sur téléphone.
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[34rem]">
            <thead className="bg-white text-ink-soft text-xs uppercase border-b border-border">
              <tr>
                <th className="text-left px-3 py-3">Produit</th>
                <th className="text-left px-3 py-3 hidden md:table-cell">SKU / code</th>
                <th className="text-right px-3 py-3">Attendu</th>
                <th className="text-right px-3 py-3">Compté</th>
                <th className="text-right px-3 py-3">Écart</th>
                <th className="text-right px-3 py-3 hidden md:table-cell">Valeur</th>
              </tr>
            </thead>
            <tbody>
              {visibleLines.map((l) => {
                const expected = Number(l.expected_qty);
                const counted = Number(l.counted_qty);
                const delta = Number((counted - expected).toFixed(3));
                const price = Number(l.purchase_price_ht ?? 0);
                const value = Number((delta * price).toFixed(2));
                return (
                  <tr key={l.id} className="border-t border-border">
                    <td className="px-3 py-3">
                      <div className="font-medium">{l.product_name}</div>
                      <div className="text-xs text-ink-soft">
                        {l.category_name ?? '—'}{l.supplier_ref ? ` · ${l.supplier_ref}` : ''}
                      </div>
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell text-ink-soft text-xs font-mono">
                      {l.sku ?? l.barcode ?? '—'}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{expected}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {locked ? (
                        counted
                      ) : (
                        <input
                          type="number"
                          step="0.001"
                          min={0}
                          className="input h-9 text-sm text-right tabular-nums w-24"
                          value={counted}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setLines((cur) => cur.map((x) =>
                              x.id === l.id ? { ...x, counted_qty: String(v) } : x));
                          }}
                          onBlur={(e) => void patchCount(l.id, Number(e.target.value) || 0)}
                        />
                      )}
                    </td>
                    <td className={`px-3 py-3 text-right tabular-nums font-semibold ${
                      delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-ink-soft'
                    }`}>
                      {delta > 0 ? `+${delta}` : delta}
                    </td>
                    <td className={`px-3 py-3 text-right hidden md:table-cell tabular-nums ${
                      value > 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-ink-soft'
                    }`}>
                      {price > 0 ? (value >= 0 ? `+${formatEUR(value)}` : formatEUR(value)) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Actions */}
      <div className="mt-6 flex flex-wrap justify-end gap-2 print:hidden">
        {!locked && (
          <button
            onClick={() => void cancelInventory()}
            className="btn-ghost h-12 text-base px-4 text-danger hover:bg-danger/10"
          >
            Annuler l&apos;inventaire
          </button>
        )}
        {status === 'in_progress' && (
          <button
            onClick={() => void goReview()}
            className="btn-soft h-12 text-base font-semibold px-6"
          >
            Passer au pointage
          </button>
        )}
        {isReviewing && (
          <>
            <button
              onClick={printReview}
              className="btn-soft h-12 text-base font-semibold px-6"
            >
              🖨 Écarts en PDF
            </button>
            <button
              onClick={() => void finalize()}
              className="btn-primary h-12 text-base font-semibold px-6"
            >
              ✓ Valider et enregistrer les mouvements
            </button>
          </>
        )}
      </div>

      {showFinalizedReport && (
        <FinalizedReportModal
          report={showFinalizedReport}
          onClose={() => setShowFinalizedReport(null)}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, extra, tone }: {
  label: string; value: string; extra?: string;
  tone?: 'success' | 'danger';
}) {
  const color =
    tone === 'success' ? 'text-success' :
    tone === 'danger' ? 'text-danger' : 'text-ink';
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wider text-ink-soft">{label}</div>
      <div className={`text-2xl font-semibold mt-1 tabular-nums ${color}`}>{value}</div>
      {extra && (
        <div className={`text-xs mt-0.5 tabular-nums ${color}`}>{extra}</div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: 'success' | 'warning' | 'neutral' | 'danger' }> = {
    in_progress: { label: 'Comptage en cours', tone: 'warning' },
    in_review:   { label: 'Pointage écarts',   tone: 'warning' },
    finalized:   { label: 'Validé',             tone: 'success' },
    cancelled:   { label: 'Annulé',             tone: 'neutral' },
  };
  const s = map[status] ?? { label: status, tone: 'neutral' as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

function FinalizedReportModal({ report, onClose }: {
  report: FinalizeReport;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl lg:max-w-4xl p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Inventaire validé</h3>
        <p className="text-sm text-ink-soft mt-1">
          Les mouvements de stock ont été enregistrés.
        </p>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="rounded-xl bg-success/10 p-3">
            <div className="text-xs uppercase tracking-wider text-success">Surplus</div>
            <div className="text-2xl font-semibold text-success mt-1 tabular-nums">
              +{report.positive_count}
            </div>
            {report.positive_value !== 0 && (
              <div className="text-xs text-success mt-0.5 tabular-nums">
                +{formatEUR(report.positive_value)}
              </div>
            )}
          </div>
          <div className="rounded-xl bg-danger/10 p-3">
            <div className="text-xs uppercase tracking-wider text-danger">Manquants</div>
            <div className="text-2xl font-semibold text-danger mt-1 tabular-nums">
              {report.negative_count > 0 ? `-${report.negative_count}` : '0'}
            </div>
            {report.negative_value !== 0 && (
              <div className="text-xs text-danger mt-0.5 tabular-nums">
                {formatEUR(report.negative_value)}
              </div>
            )}
          </div>
        </div>

        {report.movements.length > 0 && (
          <div className="mt-4 max-h-60 overflow-y-auto space-y-1">
            {report.movements.map((m, i) => (
              <div key={i} className="flex justify-between text-sm border-b border-border py-1">
                <span className="truncate mr-2">{m.product_name}</span>
                <span className={`tabular-nums font-medium ${m.delta > 0 ? 'text-success' : 'text-danger'}`}>
                  {m.delta > 0 ? '+' : ''}{m.delta}
                  {m.value !== 0 && (
                    <span className="text-xs ml-2 text-ink-soft">
                      ({m.value >= 0 ? '+' : ''}{formatEUR(m.value)})
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        <button onClick={onClose} className="btn-primary w-full mt-5 h-12 text-base font-semibold">
          Fermer
        </button>
      </div>
    </div>
  );
}

function prettyError(code?: string, message?: string): string {
  switch (code) {
    case 'PRODUCT_NOT_FOUND': return 'Produit introuvable pour ce code.';
    case 'INVENTORY_LOCKED':  return 'Inventaire clôturé.';
    default: return message ?? code ?? 'Erreur';
  }
}
