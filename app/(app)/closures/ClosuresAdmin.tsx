'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import { PAYMENT_LABELS } from '@/components/labels';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import BankDepositModal from './BankDepositModal';
import { promptThemed, confirmThemed } from '@/lib/ui/dialog';

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
  reopened?: boolean;
  held_count: number;
}

interface Store { id: string; name: string }
interface Register { id: string; store_id: string; code: string; name: string }

export default function ClosuresAdmin({ stores, registers, defaultStoreId, initialPreview }: {
  stores: Store[]; registers: Register[];
  /** Boutique du poste (rendu serveur). */
  defaultStoreId?: string;
  /** Aperçu déjà calculé côté serveur (1er rendu sans fetch). */
  initialPreview?: PreviewData | null;
}) {
  const [storeId, setStoreId] = useState(defaultStoreId || stores[0]?.id || '');
  const [date] = useState(new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState<PreviewData | null>(initialPreview ?? null);
  const [denomCount, setDenomCount] = useState<Record<string, number>>({});
  const [declared, setDeclared] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [sealing, setSealing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sealedResult, setSealedResult] = useState<{ id: string; fiscal_hash: string } | null>(null);
  const [showDeposit, setShowDeposit] = useState(false);
  const [drawerToast, setDrawerToast] = useState<string | null>(null);
  const [zToast, setZToast] = useState<string | null>(null);
  const [restored, setRestored] = useState<boolean>(false);

  // Impression du Z sur l'imprimante ticket ; repli PDF si aucune imprimante.
  async function printZ(closureId: string) {
    setZToast(null); setError(null);
    try {
      const r = await fetch(`/api/closures/${closureId}/z-print`, { method: 'POST' });
      if (r.ok) {
        setZToast('Rapport Z envoyé à l’imprimante.');
        setTimeout(() => setZToast(null), 4000);
        return;
      }
      if (r.status === 409) { window.open(`/api/closures/${closureId}/z-pdf`, '_blank'); return; }
      setError('Impression du Z impossible.');
    } catch {
      setError('Impression du Z impossible.');
    }
  }
  const [loadingPreview, setLoadingPreview] = useState(!initialPreview);

  // ---------------------------------------------------------------------------
  // PERSISTANCE LOCALE DU COMPTAGE
  // ---------------------------------------------------------------------------
  // Le précomptage des espèces, la saisie des montants déclarés par moyen de
  // paiement et les notes sont sauvegardés dans localStorage, scopés à
  // (store_id, business_date). Cela permet à l'utilisateur de quitter la page,
  // d'aller faire autre chose (ex : remise en banque, retour produit), et de
  // retrouver son comptage tel quel au retour — jusqu'à la clôture effective
  // qui purge la clé.
  const storageKey = storeId && date ? `webpos_closure_draft:${storeId}:${date}` : null;

  // Référence : indique si la restauration depuis localStorage est terminée.
  // Tant qu'elle ne l'est pas, on ne sauvegarde pas → évite la race
  // condition qui effaçait l'enregistrement à la première render.
  const restorePhaseRef = useRef<Record<string, boolean>>({});

  // Restaure depuis localStorage à chaque changement (store, date).
  // Si la journée est DÉJÀ clôturée (sealed), on n'ouvre PAS l'historique :
  // on part d'un brouillon vide et on purge l'éventuel localStorage —
  // une journée scellée ne se re-clôture pas.
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    setRestored(false);
    const alreadyClosedToday = preview?.sealed != null;
    if (alreadyClosedToday) {
      setDenomCount({}); setDeclared({}); setNotes('');
      try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
      restorePhaseRef.current[storageKey] = true;
      return;
    }
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
    restorePhaseRef.current[storageKey] = true;
  }, [storageKey, preview?.sealed]);

  // Sauvegarde à chaque modification — UNIQUEMENT après que la
  // restauration a été tentée pour cette clé. Sinon on écrasait
  // le brouillon à la première render (état initial vide).
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    if (!restorePhaseRef.current[storageKey]) return;
    const hasContent =
      Object.values(denomCount).some((v) => v > 0)
      || Object.values(declared).some((v) => v && v !== '')
      || notes.trim() !== '';
    if (!hasContent) {
      // Comportement : on NE supprime PAS la clé tant que la clôture
      // n'a pas eu lieu — l'utilisateur veut conserver son comptage
      // même si tout est temporairement à 0 (typo, effacement…).
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

  // Chargement robuste : état de chargement explicite + gestion d'erreur avec
  // ré-essai (évite de rester bloqué sur « Chargement… » si le 1er appel
  // échoue/traîne — d'où le « il faut recliquer pour que ça s'affiche »).
  const loadPreview = useCallback(async () => {
    if (!storeId || !date) { setLoadingPreview(false); return; }
    setLoadingPreview(true); setError(null);
    try {
      const r = await fetch(`/api/closures/daily/preview?store_id=${storeId}&date=${date}`, { cache: 'no-store' });
      if (r.ok) setPreview(await r.json());
      else setError('Impossible de charger la clôture. Réessaie.');
    } catch {
      setError('Impossible de charger la clôture (réseau). Réessaie.');
    } finally {
      setLoadingPreview(false);
    }
  }, [storeId, date]);
  // On saute le 1er fetch client si l'aperçu vient déjà du serveur (même
  // boutique/date) — la page est déjà peinte. On refetch ensuite normalement
  // si la boutique/date change ou après un scellement/une remise.
  const skipFirstLoad = useRef(!!initialPreview);
  useEffect(() => {
    setSealedResult(null);
    if (skipFirstLoad.current) { skipFirstLoad.current = false; return; }
    void loadPreview();
  }, [loadPreview]);

  const countedCash = useMemo(() => {
    let total = 0;
    for (const d of DENOMINATIONS) {
      total += (denomCount[String(d.value)] ?? 0) * d.value;
    }
    return Number(total.toFixed(2));
  }, [denomCount]);

  const expectedCash = preview?.cash_breakdown.expected ?? 0;
  // Écart = compté − attendu, TOUJOURS. Tant qu'on n'a rien compté (0), l'écart
  // affiche donc −(montant attendu) : on « doit » encore compter cette somme.
  const cashVariance = Number((countedCash - expectedCash).toFixed(2));

  // --- Détection des ÉCARTS (erreurs de caisse) ---
  // Espèces : écart uniquement si l'on a compté quelque chose et que ça ne
  // correspond pas. Autres règlements : écart si la saisie ≠ total système.
  const hasCashDiscrepancy = countedCash > 0 && cashVariance !== 0;
  const paymentVariances = useMemo(() => {
    if (!preview) return [] as { method: string; variance: number }[];
    return preview.payments
      .filter((p) => p.method !== 'cash')
      .map((p) => {
        const dv = declared[p.method];
        const n = Number(dv);
        if (dv == null || dv === '' || !Number.isFinite(n)) return null;
        const variance = Number((n - p.total).toFixed(2));
        return variance !== 0 ? { method: p.method, variance } : null;
      })
      .filter((x): x is { method: string; variance: number } => x != null);
  }, [preview, declared]);
  const hasAnyDiscrepancy = hasCashDiscrepancy || paymentVariances.length > 0;

  // Comptage tactile : 1 clic sur une tuile = +1 ; appui long = saisir le
  // nombre exact (évite de cliquer 50 fois pour 50 pièces).
  const lpTimer = useRef<number | null>(null);
  const lpFired = useRef(false);
  function bump(value: number, delta: number) {
    setDenomCount((c) => {
      const cur = c[String(value)] ?? 0;
      return { ...c, [String(value)]: Math.max(0, cur + delta) };
    });
  }
  function pressStart(value: number, label: string) {
    if (alreadySealed) return;
    lpFired.current = false;
    lpTimer.current = window.setTimeout(() => {
      lpFired.current = true;
      const cur = denomCount[String(value)] ?? 0;
      void promptThemed({
        title: `Nombre de ${label}`,
        message: 'Saisis la quantité présente dans le tiroir.',
        defaultValue: cur ? String(cur) : '',
        placeholder: '0',
      }).then((v) => {
        if (v == null) return;
        const n = Math.max(0, Math.floor(Number(v.replace(',', '.')) || 0));
        setDenomCount((c) => ({ ...c, [String(value)]: n }));
      });
    }, 450);
  }
  function pressEnd(value: number) {
    if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; }
    if (!lpFired.current && !alreadySealed) bump(value, 1);
  }
  function pressCancel() {
    if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; }
  }

  async function seal() {
    if (!preview) return;
    // Erreur de caisse : on prévient AVANT de sceller (irréversible).
    if (hasAnyDiscrepancy) {
      const parts: string[] = [];
      if (hasCashDiscrepancy) parts.push(`espèces ${cashVariance >= 0 ? '+' : ''}${formatEUR(cashVariance)}`);
      for (const pv of paymentVariances) {
        parts.push(`${PAYMENT_LABELS[pv.method] ?? pv.method} ${pv.variance >= 0 ? '+' : ''}${formatEUR(pv.variance)}`);
      }
      const ok = await confirmThemed({
        title: '⚠ Attention — erreur de caisse',
        message: `Un écart a été détecté : ${parts.join(' · ')}.\n\nClôturer quand même ? La clôture est définitive.`,
      });
      if (!ok) return;
    }
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
    // Auto-impression du Z si configurée.
    void (async () => {
      try {
        const [rR, rP] = await Promise.all([
          fetch(`/api/settings/receipt${storeId ? `?store_id=${encodeURIComponent(storeId)}` : ''}`),
          fetch(`/api/settings/printer${storeId ? `?store_id=${encodeURIComponent(storeId)}` : ''}`),
        ]);
        if (!rR.ok || !rP.ok) return;
        const recv = (await rR.json()).settings;
        const printer = (await rP.json()).settings;
        if (recv?.auto_print_z && printer?.enabled) {
          const url = `/api/closures/daily/${j.daily_closure_id}/pdf`;
          const w = window.open(url, '_blank');
          if (w) {
            w.addEventListener('load', () => {
              try { w.print(); } catch { /* iOS bloque souvent print() */ }
            });
          }
        }
      } catch { /* ignore */ }
    })();
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
    <div className="p-6 md:p-8 flex flex-col gap-3 md:h-full md:overflow-hidden">
      {/* Header : titre + boutons à droite sur la même ligne */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clôture de caisse</h1>
          {alreadySealed && (
            <Badge tone="success">
              Scellée le {new Date(preview!.sealed!.sealed_at).toLocaleString('fr-FR')}
            </Badge>
          )}
          {!alreadySealed && preview?.reopened && (
            <Badge tone="warning">
              Journée rouverte — nouvelle clôture (période depuis la précédente)
            </Badge>
          )}
        </div>
        {/* Toutes les actions de la journée sont réunies ici : ouvrir le tiroir,
            remise en banque et la clôture elle-même (action finale, en rouge). */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button onClick={() => void openDrawer()} disabled={!registerId}
                  className="btn-soft h-10 px-3.5 text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
                  title="Ouvrir le tiroir-caisse">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="8" width="18" height="11" rx="1.5" /><path d="M3 12.5h18" /><path d="M10.5 15.5h3" />
            </svg>
            Ouvrir le tiroir
          </button>
          <button onClick={() => setShowDeposit(true)} disabled={!registerId || alreadySealed}
                  className="btn-soft h-10 px-3.5 text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
                  title="Enregistrer une remise d'espèces en banque">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 21h18" /><path d="M5 21V10" /><path d="M19 21V10" /><path d="M12 3 3.5 8h17L12 3Z" /><path d="M9 21v-7h6v7" />
            </svg>
            Remise en banque
          </button>
          {alreadySealed ? (
            <>
              {preview?.sealed && (
                <button onClick={() => void printZ(preview.sealed!.id)}
                        className="btn-soft h-10 px-3.5 text-sm font-medium inline-flex items-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="7" rx="1.5" /><path d="M7 16h10v5H7z" />
                  </svg>
                  Imprimer le Z
                </button>
              )}
              <a href="/caisse" className="btn-primary h-10 px-3.5 text-sm inline-flex items-center gap-2"
                 title="Reprendre les ventes en ouvrant une nouvelle session caisse">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
                Réouvrir la journée
              </a>
            </>
          ) : (
            <button
              onClick={() => void seal()}
              disabled={!preview || sealing || (preview.held_count ?? 0) > 0}
              className="btn h-10 px-4 text-sm font-semibold bg-danger text-white hover:bg-danger/90 disabled:opacity-50"
              title={(preview?.held_count ?? 0) > 0
                ? 'Des paniers sont en attente : finissez-les avant de clôturer'
                : 'Clôturer définitivement la journée'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
              {sealing ? 'Clôture…' : hasAnyDiscrepancy ? 'Clôturer malgré l’écart' : 'Clôturer ma journée'}
            </button>
          )}
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
        loadingPreview ? (
          <div className="flex items-center gap-2 text-ink-soft text-sm py-6">
            <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.2-8.6" strokeLinecap="round" /></svg>
            Chargement de la clôture…
          </div>
        ) : (
          <div className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger flex items-center justify-between gap-3">
            <span>{error ?? 'La clôture n\'a pas pu être chargée.'}</span>
            <button onClick={() => void loadPreview()} className="btn-primary text-sm">Réessayer</button>
          </div>
        )
      ) : (
        <>
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

          {/* Bandeaux d'alerte et retours d'action : conditionnels, ils ne
              prennent de la hauteur que lorsqu'il y a réellement quelque chose
              à signaler — la section espèces garde sinon toute la place. */}
          {!alreadySealed && (preview.held_count ?? 0) > 0 && (
            <div className="rounded-xl bg-warning/10 px-3 py-2 text-xs text-warning shrink-0">
              ⚠ {preview.held_count} panier{preview.held_count > 1 ? 's' : ''} en attente — finissez-les ou videz-les avant de clôturer.
            </div>
          )}
          {!alreadySealed && hasAnyDiscrepancy && (
            <div className="rounded-xl bg-danger/10 border border-danger/30 px-3 py-2 text-sm text-danger font-medium flex flex-wrap items-center gap-x-2 gap-y-0.5 shrink-0">
              <span>⚠ Erreur de caisse :</span>
              {hasCashDiscrepancy && (
                <span>espèces {cashVariance >= 0 ? '+' : ''}{formatEUR(cashVariance)}</span>
              )}
              {paymentVariances.map((pv) => (
                <span key={pv.method}>· {PAYMENT_LABELS[pv.method] ?? pv.method} {pv.variance >= 0 ? '+' : ''}{formatEUR(pv.variance)}</span>
              ))}
            </div>
          )}
          {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger shrink-0">{error}</div>}
          {zToast && <div className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success shrink-0">{zToast}</div>}
          {sealedResult && (
            <div className="rounded-xl bg-success/10 px-4 py-2.5 text-sm text-success flex items-center justify-between gap-3 shrink-0">
              <span>
                ✓ Clôture scellée. Empreinte fiscale <code className="font-mono">{sealedResult.fiscal_hash.slice(0,16)}…</code>
              </span>
              <button onClick={() => void printZ(sealedResult.id)} className="btn-primary text-sm">
                Imprimer le Z
              </button>
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
                          <>
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
                            {/* Toggle "Montant conforme" — clic = saisie = total système */}
                            <button
                              type="button"
                              disabled={alreadySealed}
                              onClick={() => setDeclared({
                                ...declared,
                                [p.method]: variance === 0
                                  ? ''
                                  : String(p.total.toFixed(2)),
                              })}
                              className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                                variance === 0
                                  ? 'bg-success/10 text-success border-success/30'
                                  : 'bg-white text-ink-soft border-border hover:border-gray-300'
                              }`}
                            >
                              {variance === 0
                                ? <>✓ Montant conforme (cliquer pour réinitialiser)</>
                                : <>Valider le montant attendu : {formatEUR(p.total)}</>}
                            </button>
                          </>
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

              {/* Notes : dans la colonne de gauche (demi-écran) et non plus en
                  bandeau pleine largeur, pour laisser toute la hauteur au
                  comptage des espèces. */}
              <section className="card p-4">
                <label className="block">
                  <span className="text-sm font-semibold">Notes</span>
                  <textarea
                    className="input mt-2 h-16"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Commentaire, écart justifié, événement particulier…"
                    disabled={alreadySealed}
                  />
                </label>
              </section>
            </div>

            {/* Colonne 2 : comptage espèces — pleine hauteur, résumé toujours visible */}
            <section className="card p-4 flex flex-col min-h-0">
              <div className="shrink-0">
                <h3 className="font-semibold">Comptage des espèces</h3>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Touche une valeur = <strong>+1</strong>. Appui long = saisir le nombre exact.
                </p>
              </div>
              {/* Grille : seule zone qui peut défiler sur petit écran */}
              <div className="mt-2 flex-1 min-h-0 overflow-auto">
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {DENOMINATIONS.map((d) => {
                    const qty = denomCount[String(d.value)] ?? 0;
                    const sub = qty * d.value;
                    return (
                      <button
                        key={d.value}
                        type="button"
                        disabled={alreadySealed}
                        onPointerDown={() => pressStart(d.value, d.label)}
                        onPointerUp={() => pressEnd(d.value)}
                        onPointerLeave={pressCancel}
                        onContextMenu={(e) => e.preventDefault()}
                        className={`relative rounded-lg border p-1.5 text-center select-none touch-none transition-colors disabled:opacity-50 ${
                          qty > 0 ? 'border-[color:var(--primary)] bg-primary-soft/40' : 'border-border hover:bg-gray-50'
                        }`}
                      >
                        <div className="text-xs font-semibold tabular-nums">{d.label}</div>
                        <div className="text-lg font-bold tabular-nums leading-tight">{qty}</div>
                        <div className="text-[10px] text-ink-soft tabular-nums">{formatEUR(sub)}</div>
                        {qty > 0 && !alreadySealed && (
                          <span
                            role="button"
                            aria-label="Supprimer ce comptage"
                            title="Supprimer ce comptage"
                            onPointerDown={(e) => { e.stopPropagation(); }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDenomCount((c) => { const n = { ...c }; delete n[String(d.value)]; return n; });
                            }}
                            className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-danger text-white text-[10px] font-bold leading-none shadow-sm hover:opacity-90"
                          >
                            ✕
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Résumé — toujours visible (attendu / compté / écart / reste) */}
              <div className="shrink-0 mt-3 rounded-xl bg-gray-50 p-3">
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-soft tabular-nums">
                  <span>Fonds {formatEUR(preview.cash_breakdown.opening_floats)}</span>
                  <span>+ Ventes {formatEUR(preview.cash_breakdown.cash_sales)}</span>
                  {preview.cash_breakdown.cash_in > 0 && <span>+ Entrées {formatEUR(preview.cash_breakdown.cash_in)}</span>}
                  {preview.cash_breakdown.bank_deposits > 0 && (
                    <span className="text-warning">− Banque {formatEUR(preview.cash_breakdown.bank_deposits)}</span>
                  )}
                </div>
                <div className="mt-1.5 flex justify-between text-sm">
                  <span className="text-ink-soft">Espèces attendues</span>
                  <span className="font-medium tabular-nums">{formatEUR(expectedCash)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-ink-soft">Espèces comptées</span>
                  <span className="font-medium tabular-nums">{formatEUR(countedCash)}</span>
                </div>
                <div className="mt-1.5 pt-1.5 border-t border-border/70 flex items-baseline justify-between">
                  <span className="font-semibold">Écart de caisse</span>
                  <span className={`text-2xl font-bold tabular-nums ${
                    cashVariance === 0 ? 'text-success' :
                    cashVariance > 0 ? 'text-warning' : 'text-danger'}`}>
                    {cashVariance >= 0 ? '+' : ''}{formatEUR(cashVariance)}
                  </span>
                </div>
                {expectedCash > 0 && countedCash < expectedCash && (
                  <div className="mt-0.5 text-xs text-danger text-right">
                    Reste {formatEUR(expectedCash - countedCash)} à compter
                  </div>
                )}
              </div>
            </section>
          </div>

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
