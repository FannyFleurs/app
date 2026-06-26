'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import { PAYMENT_LABELS } from '@/components/labels';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import BankDepositModal from './BankDepositModal';

const DENOMINATIONS: Array<{ value: number; label: string }> = [
  { value: 500,  label: '500 €' },
  { value: 200,  label: '200 €' },
  { value: 100,  label: '100 €' },
  { value: 50,   label: '50 €' },
  { value: 20,   label: '20 €' },
  { value: 10,   label: '10 €' },
  { value: 5,    label: '5 €' },
  { value: 2,    label: '2 €' },
  { value: 1,    label: '1 €' },
  { value: 0.5,  label: '0,50 €' },
  { value: 0.2,  label: '0,20 €' },
  { value: 0.1,  label: '0,10 €' },
  { value: 0.05, label: '0,05 €' },
  { value: 0.02, label: '0,02 €' },
  { value: 0.01, label: '0,01 €' },
];

interface PreviewData {
  totals: { sales: number; ht: number; tva: number; ttc: number; discount: number };
  tva_breakdown: { rate: number; base_ht: number; tva: number; ttc: number }[];
  payments: { method: string; total: number }[];
  cash_breakdown: {
    opening_floats: number;
    cash_sales: number;
    cash_in: number;
    cash_out: number;
    bank_deposits: number;
    expected: number;
  };
  movements: { id: string; movement_type: 'in' | 'out'; amount: number; reason: string; created_at: string }[];
  sealed: { id: string; sealed_at: string } | null;
  held_count: number;
}

interface Store { id: string; name: string }
interface Register { id: string; store_id: string; code: string; name: string }

export default function ClosuresAdmin({ stores, registers }: { stores: Store[]; registers: Register[] }) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? '');
  const [date] = useState(new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [denomCount, setDenomCount] = useState<Record<string, number>>({});
  const [declared, setDeclared] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [sealing, setSealing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sealedResult, setSealedResult] = useState<{ id: string; fiscal_hash: string } | null>(null);
  const [showDeposit, setShowDeposit] = useState(false);
  const [drawerToast, setDrawerToast] = useState<string | null>(null);
  const [restored, setRestored] = useState<boolean>(false);

  // ---------------------------------------------------------------------------
  // PERSISTANCE LOCALE DU COMPTAGE
  // ---------------------------------------------------------------------------
  // Le précomptage des espèces, la saisie des montants déclarés par moyen de
  // paiement et les notes sont sauvegardés dans localStorage, scopés à
  // (store_id, business_date). Cela permet à l'utilisateur de quitter la page,
  // d'aller faire autre chose (ex : remise en banque, retour produit), et de
  // retrouver son comptage tel quel au retour — jusqu'à la clôture effective
  // qui purge la clé.
  const storageKey = storeId && date ? `florea_closure_draft:${storeId}:${date}` : null;

  // Restaure depuis localStorage à chaque changement (store, date).
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    setRestored(false);
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const draft = JSON.parse(raw) as {
          denom?: Record<string, number>;
          declared?: Record<string, string>;
          notes?: string;
        };
        setDenomCount(draft.denom ?? {});
        setDeclared(draft.declared ?? {});
        setNotes(draft.notes ?? '');
        setRestored(true);
      } else {
        setDenomCount({}); setDeclared({}); setNotes('');
      }
    } catch { /* ignore */ }
  }, [storageKey]);

  // Sauvegarde à chaque modification.
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    const hasContent =
      Object.values(denomCount).some((v) => v > 0)
      || Object.values(declared).some((v) => v && v !== '')
      || notes.trim() !== '';
    if (!hasContent) {
      localStorage.removeItem(storageKey);
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        denom: denomCount,
        declared,
        notes,
      }));
    } catch { /* ignore */ }
  }, [storageKey, denomCount, declared, notes]);

  const registersForStore = useMemo(
    () => registers.filter((r) => r.store_id === storeId),
    [registers, storeId],
  );
  const [registerId, setRegisterId] = useState<string>('');
  useEffect(() => { setRegisterId(registersForStore[0]?.id ?? ''); }, [registersForStore]);

  async function loadPreview() {
    setError(null);
    if (!storeId || !date) return;
    const r = await fetch(`/api/closures/daily/preview?store_id=${storeId}&date=${date}`);
    if (r.ok) setPreview(await r.json());
  }
  useEffect(() => { setSealedResult(null); void loadPreview(); /* eslint-disable-next-line */ }, [storeId, date]);

  const countedCash = useMemo(() => {
    let total = 0;
    for (const d of DENOMINATIONS) {
      total += (denomCount[String(d.value)] ?? 0) * d.value;
    }
    return Number(total.toFixed(2));
  }, [denomCount]);

  const expectedCash = preview?.cash_breakdown.expected ?? 0;
  const cashVariance = countedCash > 0 ? Number((countedCash - expectedCash).toFixed(2)) : 0;

  async function seal() {
    if (!preview) return;
    setSealing(true); setError(null);
    const declaredPayments: Record<string, number> = {};
    for (const [k, v] of Object.entries(declared)) {
      const n = Number(v);
      if (Number.isFinite(n)) declaredPayments[k] = n;
    }
    const denominations: Record<string, number> = {};
    for (const [k, v] of Object.entries(denomCount)) {
      if (v > 0) denominations[k] = v;
    }
    const body: Record<string, unknown> = {
      store_id: storeId,
      business_date: date,
    };
    if (countedCash > 0) body.counted_cash = countedCash;
    if (Object.keys(declaredPayments).length > 0) body.declared_payments = declaredPayments;
    if (Object.keys(denominations).length > 0) body.denomination_count = denominations;
    if (notes.trim()) body.notes = notes.trim();

    const r = await fetch('/api/closures/daily', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSealing(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? 'Erreur de scellement');
      return;
    }
    const j = await r.json();
    setSealedResult({ id: j.daily_closure_id, fiscal_hash: j.fiscal_hash });
    // Clôture effective → purge le brouillon local.
    if (storageKey && typeof window !== 'undefined') {
      try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    }
    await loadPreview();
  }

  async function openDrawer() {
    if (!registerId) {
      setDrawerToast('Aucune caisse active.');
      return;
    }
    const r = await fetch('/api/cash-sessions/open-drawer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ register_id: registerId, reason: 'Ouverture manuelle depuis clôture' }),
    });
    if (r.ok) {
      setDrawerToast('Tiroir ouvert · action tracée dans l\'audit');
      setTimeout(() => setDrawerToast(null), 2500);
    }
  }

  if (!stores.length) {
    return (
      <div className="p-8">
        <EmptyState icon="◐" title="Aucune boutique configurée" />
      </div>
    );
  }

  const alreadySealed = preview?.sealed != null;

  return (
    <div className="p-6 flex flex-col gap-3 h-[calc(100vh-56px)] overflow-hidden">
      {/* Header : titre + boutons à droite sur la même ligne */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clôture de caisse</h1>
          {alreadySealed && (
            <Badge tone="success">
              Scellée le {new Date(preview!.sealed!.sealed_at).toLocaleString('fr-FR')}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {registersForStore.length > 1 && (
            <select className="input h-10 max-w-[180px]" value={registerId} onChange={(e) => setRegisterId(e.target.value)}>
              {registersForStore.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
          <button onClick={() => void openDrawer()} disabled={!registerId} className="btn-soft text-sm h-10">
            ◰ Ouvrir tiroir
          </button>
          <button onClick={() => setShowDeposit(true)} disabled={!registerId || alreadySealed} className="btn-soft text-sm h-10">
            ⤓ Remise en banque
          </button>
        </div>
      </div>

      {drawerToast && (
        <div className="rounded-xl bg-success/10 px-3 py-1.5 text-xs text-success">{drawerToast}</div>
      )}

      {restored && !sealedResult && !alreadySealed && (
        <div className="rounded-xl bg-accent-soft px-3 py-1.5 text-xs flex items-center justify-between gap-3">
          <span className="text-accent-deep">
            ↻ Précomptage restauré — votre saisie a été conservée depuis votre dernière visite.
          </span>
          <button
            onClick={() => {
              setDenomCount({}); setDeclared({}); setNotes('');
              if (storageKey && typeof window !== 'undefined') {
                try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
              }
              setRestored(false);
            }}
            className="text-xs text-ink-soft hover:text-danger underline"
          >
            Repartir de zéro
          </button>
        </div>
      )}

      {!preview ? (
        <div className="text-ink-soft text-sm">Chargement…</div>
      ) : (
        <>
          {/* KPI strip compact */}
          <div className="grid grid-cols-4 gap-2">
            <Kpi label="Tickets" value={preview.totals.sales.toString()} />
            <Kpi label="Total HT" value={formatEUR(preview.totals.ht)} />
            <Kpi label="TVA collectée" value={formatEUR(preview.totals.tva)} />
            <Kpi label="Total TTC" value={formatEUR(preview.totals.ttc)} accent />
          </div>

          {alreadySealed && (
            <div className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">
              ✓ La journée a déjà été clôturée le {new Date(preview!.sealed!.sealed_at).toLocaleString('fr-FR')}.
              Les écarts d&apos;espèces ne sont plus pertinents — vous pouvez réimprimer le Z.
            </div>
          )}
          {!alreadySealed && preview.totals.sales === 0 && (
            <div className="rounded-xl border border-border bg-gray-50 px-3 py-1.5 text-xs text-ink-soft">
              Aucune vente sur cette date. Vous pouvez quand même compter votre tiroir, faire une
              remise en banque et clôturer la journée pour la déclarer.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0 overflow-hidden">
            {/* Colonne 1 : paiements + TVA + mouvements */}
            <div className="space-y-3 overflow-auto min-h-0">
              <section className="card p-4">
                <h3 className="font-semibold">Réconciliation des paiements</h3>
                <p className="mt-1 text-sm text-ink-soft">
                  Saisissez ce que vous avez réellement reçu pour faire apparaître les écarts.
                </p>
                <div className="mt-4 space-y-2">
                  {preview.payments.length === 0 ? (
                    <p className="text-sm text-ink-soft">Aucun paiement enregistré pour cette date.</p>
                  ) : preview.payments.map((p) => {
                    const declaredVal = declared[p.method] ?? '';
                    const declaredNum = Number(declaredVal);
                    const hasDeclared = declaredVal !== '' && Number.isFinite(declaredNum);
                    const variance = hasDeclared ? Number((declaredNum - p.total).toFixed(2)) : null;
                    return (
                      <div key={p.method} className="rounded-xl border border-border p-3">
                        <div className="flex items-center justify-between">
                          <Badge tone="soft">{PAYMENT_LABELS[p.method] ?? p.method}</Badge>
                          <span className="text-sm">
                            <span className="text-ink-soft">Système : </span>
                            <span className="font-medium">{formatEUR(p.total)}</span>
                          </span>
                        </div>
                        {p.method !== 'cash' && (
                          <div className="mt-2 flex items-center gap-2">
                            <label className="text-xs text-ink-soft w-24 shrink-0">Saisie réelle</label>
                            <input
                              type="number" step="0.01" min={0}
                              placeholder="0,00"
                              className="input h-9 flex-1"
                              value={declaredVal}
                              onChange={(e) => setDeclared({ ...declared, [p.method]: e.target.value })}
                              disabled={alreadySealed}
                            />
                            {variance !== null && (
                              <span className={`text-xs whitespace-nowrap font-medium ${
                                variance === 0 ? 'text-success' : 'text-warning'}`}>
                                Écart {variance >= 0 ? '+' : ''}{formatEUR(variance)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {preview.movements.length > 0 && (
                <section className="card p-5">
                  <h3 className="font-semibold">Mouvements caisse du jour</h3>
                  <ul className="mt-3 space-y-1 text-sm">
                    {preview.movements.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-2 border-b border-border/60 pb-1.5 last:border-0">
                        <div className="flex items-center gap-2">
                          <Badge tone={m.movement_type === 'in' ? 'success' : 'warning'}>
                            {m.movement_type === 'in' ? 'Entrée' : 'Sortie'}
                          </Badge>
                          <span>{m.reason}</span>
                        </div>
                        <span className={`font-medium ${m.movement_type === 'in' ? 'text-success' : 'text-danger'}`}>
                          {m.movement_type === 'in' ? '+' : '-'}{formatEUR(m.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {preview.tva_breakdown.length > 0 && (
                <section className="card p-5">
                  <h3 className="font-semibold">Récapitulatif TVA</h3>
                  <table className="mt-3 w-full text-sm">
                    <tbody>
                      {preview.tva_breakdown.map((t) => (
                        <tr key={t.rate} className="border-t border-border first:border-t-0">
                          <td className="py-2">TVA {t.rate}%</td>
                          <td className="py-2 text-right text-ink-soft">Base {formatEUR(t.base_ht)}</td>
                          <td className="py-2 text-right font-medium">{formatEUR(t.tva)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}
            </div>

            {/* Colonne 2 : comptage espèces */}
            <section className="card p-4 overflow-auto min-h-0">
              <h3 className="font-semibold">Comptage des espèces en caisse</h3>
              <p className="mt-1 text-sm text-ink-soft">
                Saisissez le nombre de billets et pièces présents dans le tiroir.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {DENOMINATIONS.map((d) => {
                  const qty = denomCount[String(d.value)] ?? 0;
                  const sub = qty * d.value;
                  return (
                    <div key={d.value} className="flex items-center gap-2 rounded-lg border border-border p-2">
                      <span className="w-16 text-sm font-medium tabular-nums">{d.label}</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="input h-9 flex-1 text-right tabular-nums"
                        value={qty || ''}
                        placeholder="0"
                        onChange={(e) => {
                          const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                          setDenomCount({ ...denomCount, [String(d.value)]: v });
                        }}
                        disabled={alreadySealed}
                      />
                      <span className="w-20 text-right text-xs text-ink-soft tabular-nums">
                        {formatEUR(sub)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 space-y-1.5 text-sm rounded-xl bg-gray-50 p-4">
                <div className="flex justify-between">
                  <span className="text-ink-soft">Fonds de caisse ouverts</span>
                  <span>{formatEUR(preview.cash_breakdown.opening_floats)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-soft">+ Ventes espèces</span>
                  <span>{formatEUR(preview.cash_breakdown.cash_sales)}</span>
                </div>
                {preview.cash_breakdown.cash_in > 0 && (
                  <div className="flex justify-between">
                    <span className="text-ink-soft">+ Entrées caisse</span>
                    <span>{formatEUR(preview.cash_breakdown.cash_in)}</span>
                  </div>
                )}
                {preview.cash_breakdown.cash_out > preview.cash_breakdown.bank_deposits && (
                  <div className="flex justify-between">
                    <span className="text-ink-soft">- Autres sorties caisse</span>
                    <span>-{formatEUR(preview.cash_breakdown.cash_out - preview.cash_breakdown.bank_deposits)}</span>
                  </div>
                )}
                {/* Ligne Remise en banque TOUJOURS visible (même à 0) */}
                <div className="flex justify-between">
                  <span className="text-ink-soft">⤓ Remise en banque</span>
                  <span className={preview.cash_breakdown.bank_deposits > 0 ? 'text-warning font-medium' : ''}>
                    {preview.cash_breakdown.bank_deposits > 0
                      ? `-${formatEUR(preview.cash_breakdown.bank_deposits)}`
                      : formatEUR(0)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 mt-1 border-t border-border/70">
                  <span className="font-medium">Espèces attendues</span>
                  <span className="font-medium">{formatEUR(expectedCash)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-soft">Espèces comptées</span>
                  <span className="font-medium">{formatEUR(countedCash)}</span>
                </div>
                <div className="flex items-baseline justify-between pt-2 mt-1 border-t border-border/70">
                  <span className="font-semibold">Écart</span>
                  <span className={`text-lg font-semibold ${
                    cashVariance === 0 ? 'text-success' :
                    cashVariance > 0 ? 'text-warning' : 'text-danger'}`}>
                    {cashVariance >= 0 ? '+' : ''}{formatEUR(cashVariance)}
                  </span>
                </div>
              </div>
            </section>
          </div>

          {/* Notes + Sceller (sticky en bas) */}
          <section className="card p-3 space-y-2 shrink-0">
            <label className="block">
              <span className="text-xs font-medium text-ink-soft">Notes</span>
              <textarea
                className="input mt-1 h-10"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Commentaire, écart justifié, événement particulier…"
                disabled={alreadySealed}
              />
            </label>

            {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

            {sealedResult ? (
              <div className="rounded-xl bg-success/10 px-4 py-3 text-sm text-success flex items-center justify-between gap-3">
                <span>
                  ✓ Clôture scellée. Empreinte fiscale <code className="font-mono">{sealedResult.fiscal_hash.slice(0,16)}…</code>
                </span>
                <a
                  href={`/api/closures/${sealedResult.id}/z-pdf`}
                  target="_blank" rel="noreferrer"
                  className="btn-primary text-sm"
                >
                  Imprimer le Z
                </a>
              </div>
            ) : alreadySealed ? (
              <a
                href={`/api/closures/${preview.sealed!.id}/z-pdf`}
                target="_blank" rel="noreferrer"
                className="btn-primary w-full justify-center"
              >
                Imprimer le Z de cette journée
              </a>
            ) : (
              <>
                {(preview.held_count ?? 0) > 0 && (
                  <div className="rounded-xl bg-warning/10 px-3 py-2 text-xs text-warning">
                    ⚠ {preview.held_count} panier{preview.held_count > 1 ? 's' : ''} en attente — finissez-les ou videz-les avant de clôturer.
                  </div>
                )}
                <button
                  disabled={sealing || (preview.held_count ?? 0) > 0}
                  onClick={() => void seal()}
                  className="btn-primary w-full h-11"
                >
                  {sealing ? 'Clôture…' : '🔒 Clôturer la journée et générer le Z'}
                </button>
              </>
            )}
          </section>
        </>
      )}

      {showDeposit && (
        <BankDepositModal
          registerId={registerId}
          maxAmount={Math.max(0, preview?.cash_breakdown.expected ?? 0)}
          onClose={() => setShowDeposit(false)}
          onSaved={() => { setShowDeposit(false); void loadPreview(); }}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-ink-soft">{label}</div>
      <div className={`mt-1 text-xl font-semibold tracking-tight ${accent ? 'text-accent' : ''}`}>{value}</div>
    </div>
  );
}
