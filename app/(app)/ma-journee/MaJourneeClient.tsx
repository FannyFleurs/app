'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import { PAYMENT_LABELS } from '@/components/labels';
import EmptyState from '@/components/EmptyState';
import Badge from '@/components/Badge';
import Icon, { type IconName } from '@/components/Icon';
import {
  CourbeJournee, AnneauPaiements, MicroCourbe, EtatVide, COULEURS_PAIEMENT,
} from './DayCharts';
import PageHeader from '@/components/PageHeader';
import ReturnModal from './ReturnModal';
import PaymentCorrectionModal from './PaymentCorrectionModal';
import AttachCustomerAfterSaleModal from './AttachCustomerAfterSaleModal';
import DayReportView from './DayReportView';
import GiftReceiptPickerModal from '@/components/GiftReceiptPickerModal';
import type { DayReport } from '@/lib/services/day-report';
import { promptThemed } from '@/lib/ui/dialog';
import { printReceipt } from '@/lib/pos/receipt-print';

interface Sale {
  id: string; receipt_number: string;
  total_ttc: string; total_ht: string; total_tva: string; total_discount: string;
  validated_at: string;
  status: string;
  refunded_total: string;
  fiscal_hash: string;
  cashier: string;
  customer: string | null;
}

interface SaleDetail {
  sale: Sale & {
    customer_id: string | null;
    tva_breakdown: { rate: number; base_ht: number; tva: number; ttc: number }[];
  };
  lines: {
    line_index: number; label: string;
    unit_price_ttc: string; quantity: string;
    discount_amount: string; tax_rate: string;
    line_ht: string; line_tva: string; line_ttc: string;
    product_purchase_price_ht?: string | null;
  }[];
  payments: { method: string; amount: string; reference: string | null }[];
  invoice: { id: string; number: string; period?: boolean } | null;
  returns?: Array<{
    id: string; number: string; amount: string; used_amount: string;
    status: string; reason: string; created_at: string;
  }>;
  /** Quantités déjà retournées par ligne (line_index → qté). */
  returned_by_line?: Record<number, number>;
}

type SummaryMode = 'simple' | 'complet';

/**
 * CA par heure d'encaissement, 24 seaux.
 *
 * L'heure est lue en heure de Paris et non dans le fuseau du navigateur : une
 * vente de 23 h 50 doit rester au soir de sa journée, pas basculer au
 * lendemain. Et le format demandé est en-GB : `fr-FR` rend « 10 h », dont
 * Number ne tire rien — la courbe restait plate à zéro toute la journée.
 */
export function ventilationHoraire(
  ventes: Array<Pick<Sale, 'validated_at' | 'total_ttc' | 'status'>>,
): number[] {
  const seaux = new Array<number>(24).fill(0);
  for (const s of ventes) {
    if (s.status === 'cancelled_by_credit_note') continue;
    const h = Number(new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', hour12: false, timeZone: 'Europe/Paris',
    }).format(new Date(s.validated_at)).replace(/\D/g, ''));
    if (!Number.isFinite(h)) continue;
    const i = Math.min(23, Math.max(0, h));
    seaux[i] = (seaux[i] ?? 0) + Number(s.total_ttc);
  }
  return seaux;
}

/** Même série, lue en cumulé depuis l'ouverture. */
export function cumule(valeurs: number[]): number[] {
  let acc = 0;
  return valeurs.map((v) => (acc += v));
}

export default function MaJourneeClient() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [sales, setSales] = useState<Sale[]>([]);
  const [cashSummary, setCashSummary] = useState<{
    opening_float?: number; cash_sales: number; bank_deposits: number;
    cash_refunds?: number; cash_in?: number; cash_out?: number; expected_cash: number;
  }>({ opening_float: 0, cash_sales: 0, bank_deposits: 0, cash_refunds: 0, expected_cash: 0 });
  const [returnsTotal, setReturnsTotal] = useState(0);
  const [returnsCount, setReturnsCount] = useState(0);
  // Journée de la veille : sert uniquement aux comparaisons des tuiles.
  const [veille, setVeille] = useState<{
    ttc: number; count: number; avg: number; tickets: number;
  } | null>(null);
  const [commandes, setCommandes] = useState<Array<{
    id: string; number: string; total_amount: string | null;
    requested_at: string | null; customer_name: string | null; recipient_name: string | null;
  }>>([]);
  const [vueCourbe, setVueCourbe] = useState<'heure' | 'cumule'>('heure');
  const [tiroir, setTiroir] = useState<string | null>(null);
  const champRecherche = useRef<HTMLInputElement>(null);
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [sealedAt, setSealedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  // Vente à ouvrir automatiquement (deep-link depuis l'historique article :
  // /ma-journee?date=…&sale=…). Ouverte une fois la journée chargée.
  const [pendingSaleId, setPendingSaleId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<SummaryMode>('simple');
  // Rapport X complet (identique au Z) — chargé à la demande.
  const [dayReport, setDayReport] = useState<DayReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [printingX, setPrintingX] = useState(false);
  // Boutique RÉELLEMENT affichée (renvoyée par le rapport) : on la transmet
  // explicitement à l'impression du X → verrouillage sur la bonne boutique.
  const [reportStoreId, setReportStoreId] = useState<string | null>(null);

  // Impression DIRECTE du X sur l'imprimante ticket (comme le Z). Repli sur le
  // PDF uniquement si aucune imprimante ticket n'est configurée. On envoie
  // TOUJOURS le store_id de la boutique affichée (pas de résolution implicite).
  async function printX() {
    const storeQ = reportStoreId ? `&store_id=${encodeURIComponent(reportStoreId)}` : '';
    setPrintingX(true);
    try {
      const r = await fetch('/api/reports/day/print', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, store_id: reportStoreId ?? undefined }),
      });
      if (!r.ok) window.open(`/api/reports/day/pdf?date=${date}${storeQ}`, '_blank');
    } catch {
      window.open(`/api/reports/day/pdf?date=${date}${storeQ}`, '_blank');
    } finally {
      setPrintingX(false);
    }
  }

  // Recharge la liste + synthèse du jour (aussi appelé après un retour,
  // pour défalquer le CA et afficher les badges sans recharger la page).
  function reloadDay(clearSelection = true) {
    setLoading(true);
    if (clearSelection) { setSelected(null); setDetail(null); }
    fetch(`/api/sales/today?date=${date}`)
      .then((r) => r.json())
      .then((j) => {
        setSales(j.sales ?? []);
        if (j.cash_summary) setCashSummary(j.cash_summary);
        setReturnsTotal(Number(j.returns_total ?? 0));
        setReturnsCount(Number(j.returns_count ?? 0));
        setOpenedAt(j.opened_at ?? null);
      })
      .finally(() => setLoading(false));
  }

  /** Ouvre le tiroir-caisse et dit ce qui s'est passé, sans quitter l'écran. */
  async function ouvrirTiroir() {
    setTiroir('Ouverture…');
    const r = await fetch('/api/cash-sessions/open-drawer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Ma journée' }),
    }).catch(() => null);
    setTiroir(r?.ok ? 'Tiroir ouvert' : 'Ouverture impossible');
    setTimeout(() => setTiroir(null), 2500);
  }

  useEffect(() => {
    reloadDay();
    // Indicateur "journée fermée" : check la clôture du jour
    setSealedAt(null);
    void fetch(`/api/closures/daily/today?date=${date}`)
      .then((r) => r.ok ? r.json() : null)
      .then((j) => { if (j?.sealed_at) setSealedAt(j.sealed_at); })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // Deep-link depuis l'historique article : ?date=YYYY-MM-DD&sale=<id>.
  // On force la date de la vente et on mémorise le ticket à ouvrir.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const d = sp.get('date');
    const s = sp.get('sale');
    if (d) setDate(d);
    if (s) setPendingSaleId(s);
    // Une seule lecture au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ouvre la vente en attente dès que la journée est chargée (après le
  // reloadDay déclenché par le changement de date, qui vide la sélection).
  useEffect(() => {
    if (pendingSaleId && !loading) {
      void pickSale(pendingSaleId);
      setPendingSaleId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSaleId, loading]);

  // Journée de la veille : uniquement pour les « % vs hier » des tuiles. Un
  // écran de comptoir sans repère ne dit pas si la journée est bonne.
  useEffect(() => {
    const veilleDate = new Date(`${date}T12:00:00`);
    veilleDate.setDate(veilleDate.getDate() - 1);
    const iso = veilleDate.toISOString().slice(0, 10);
    setVeille(null);
    void fetch(`/api/sales/today?date=${iso}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        const ventes = (j.sales ?? []) as Sale[];
        const ttc = ventes.reduce((s, v) => s + Number(v.total_ttc), 0) - Number(j.returns_total ?? 0);
        setVeille({
          ttc,
          count: ventes.length,
          avg: ventes.length > 0 ? ttc / ventes.length : 0,
          tickets: ventes.length + Number(j.returns_count ?? 0),
        });
      })
      .catch(() => undefined);
  }, [date]);

  // Dernières commandes (retrait / livraison), toutes dates : c'est ce qui
  // attend d'être préparé, pas ce qui a été vendu aujourd'hui.
  useEffect(() => {
    void fetch('/api/orders')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setCommandes(((j?.orders ?? []) as typeof commandes).slice(0, 4)))
      .catch(() => undefined);
  }, []);

  // Rapport de journée : il porte le détail des encaissements et des
  // catégories, dont l'écran a besoin en permanence — pas seulement quand on
  // ouvre le X complet.
  useEffect(() => {
    setLoadingReport(true);
    setDayReport(null);
    void fetch(`/api/reports/day?date=${date}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.report) setDayReport(j.report as DayReport);
        if (j?.store_id) setReportStoreId(j.store_id as string);
      })
      .finally(() => setLoadingReport(false));
  }, [date]);

  async function pickSale(id: string) {
    setSelected(id);
    setLoadingDetail(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/sales/${id}`);
      if (res.ok) setDetail(await res.json());
    } finally {
      setLoadingDetail(false);
    }
  }

  const totals = useMemo(() => {
    let ttc = 0, ht = 0, tva = 0, discount = 0;
    for (const s of sales) {
      ttc += Number(s.total_ttc); ht += Number(s.total_ht); tva += Number(s.total_tva);
      discount += Number(s.total_discount);
    }
    const avg = sales.length > 0 ? ttc / sales.length : 0;
    // CA net = ventes brutes − retours/avoirs émis ce jour (une vente
    // entièrement retournée s'annule donc, un retour partiel se défalque).
    const netTtc = ttc - returnsTotal;
    return { ttc, netTtc, ht, tva, discount, count: sales.length, avg };
  }, [sales, returnsTotal]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return sales;
    return sales.filter((s) =>
      s.receipt_number.toLowerCase().includes(needle) ||
      s.cashier?.toLowerCase().includes(needle) ||
      s.customer?.toLowerCase().includes(needle),
    );
  }, [sales, search]);

  const dateLabel = new Date(date).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  const dateCourte = new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

  const heureOuverture = openedAt
    ? new Date(openedAt).toLocaleTimeString('fr-FR', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
      })
    : null;

  const parHeure = useMemo(() => ventilationHoraire(sales), [sales]);
  const courbe = useMemo(
    () => (vueCourbe === 'heure' ? parHeure : cumule(parHeure)),
    [parHeure, vueCourbe],
  );

  // Encaissements : toujours les trois mêmes lignes, même à zéro. Une légende
  // qui change de composition d'un jour à l'autre ne se lit plus d'un coup.
  const paiements = useMemo(() => {
    const p = dayReport?.payments ?? [];
    const somme = (garde: (m: string) => boolean) =>
      p.filter((x) => garde(x.method)).reduce((s, x) => s + x.amount, 0);
    return [
      { label: 'Espèces', montant: somme((m) => m === 'cash'), couleur: COULEURS_PAIEMENT[0]! },
      { label: 'Carte bancaire', montant: somme((m) => m === 'card'), couleur: COULEURS_PAIEMENT[1]! },
      { label: 'Autres', montant: somme((m) => m !== 'cash' && m !== 'card'), couleur: COULEURS_PAIEMENT[2]! },
    ];
  }, [dayReport]);

  const topPaiement = useMemo(() => {
    const p = [...(dayReport?.payments ?? [])].sort((a, b) => b.amount - a.amount)[0];
    if (!p || p.amount <= 0) return null;
    return { label: PAYMENT_LABELS[p.method] ?? p.method, montant: p.amount };
  }, [dayReport]);

  const topCategories = useMemo(
    () => [...(dayReport?.by_category ?? [])].sort((a, b) => b.ca_ttc - a.ca_ttc).slice(0, 5),
    [dayReport],
  );
  const maxCategorie = topCategories[0]?.ca_ttc ?? 0;

  // Tickets émis = ventes + avoirs : un retour donne lieu à un ticket lui aussi.
  const ticketsEmis = totals.count + returnsCount;

  // Mouvements de tiroir autres que la remise en banque et les remboursements,
  // déjà affichés : sans cette ligne, les montants ne s'additionneraient plus.
  const autresMouvements =
    (cashSummary.cash_in ?? 0)
    - ((cashSummary.cash_out ?? 0) - cashSummary.bank_deposits - (cashSummary.cash_refunds ?? 0));

  const suffixeEcart = date === today ? 'vs hier' : 'vs la veille';
  const ecartLabel = (courant: number, precedent: number | undefined) => {
    if (precedent == null) return `— ${suffixeEcart}`;
    if (precedent === 0) return courant === 0 ? `0% ${suffixeEcart}` : `+100% ${suffixeEcart}`;
    const pct = ((courant - precedent) / Math.abs(precedent)) * 100;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}% ${suffixeEcart}`;
  };

  return (
    <div className="flex flex-col md:h-full md:overflow-hidden min-h-full bg-bg">
      <div className="px-4 md:px-6 pt-3 md:pt-4 pb-3 shrink-0 border-b border-border bg-surface">
        <PageHeader
          title="Ma journée"
          subtitle={`${dateLabel} · ${totals.count} vente(s) ce jour`}
          actions={
            <label className="inline-flex items-center gap-2 cursor-pointer relative rounded-xl bg-accent-soft px-3 h-10 text-sm font-medium text-accent-deep hover:brightness-95">
              <input
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <Icon name="calendar" size={16} /> Changer de date
            </label>
          }
        />
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[320px_1fr] md:overflow-hidden">
        {/* ---------------------------------------------- COLONNE JOURNÉE */}
        <aside className="md:overflow-y-auto p-3 flex flex-col gap-3">
          {/* État de la caisse : la première chose qu'on vérifie le matin. */}
          <div className="rounded-2xl p-4 text-white" style={{ backgroundColor: 'var(--primary)' }}>
            <div className="text-xs opacity-75">
              {openedAt ? 'Caisse ouverte à' : 'Caisse non ouverte'}
            </div>
            <div className="mt-1 flex items-end justify-between gap-2">
              <div className="text-3xl font-semibold tracking-tight tabular-nums">
                {heureOuverture ?? '—'}
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs pb-1">
                <span className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: sealedAt ? '#FFEFB3' : openedAt ? '#7ED0A5' : '#9AA5A1' }} />
                {sealedAt ? 'Clôturée' : openedAt ? 'Ouverte' : 'Fermée'}
              </span>
            </div>
          </div>

          {/* CA du jour : le chiffre qu'on vient chercher, lisible de loin. */}
          <div className="rounded-2xl bg-accent-soft p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-soft">CA TTC</span>
              <span className="text-accent-deep"><Icon name="dashboard" size={16} /></span>
            </div>
            <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
              {formatEUR(totals.netTtc)}
            </div>
            <MicroCourbe valeurs={parHeure} />
            <div className="space-y-2 border-t border-black/10 pt-3">
              <LigneCle label="CA HT" valeur={formatEUR(totals.ht)} />
              <LigneCle label="Ventes" valeur={totals.count.toString()} />
              {returnsTotal > 0 && (
                <LigneCle label="Retours / avoirs" valeur={`-${formatEUR(returnsTotal)}`} />
              )}
              <LigneCle label="Panier moyen" valeur={formatEUR(totals.avg)} />
            </div>
          </div>

          {/* Tiroir-caisse. Le fond du matin en fait partie : sans lui, le
              montant attendu ne correspond pas à ce qu'on compte le soir. */}
          <div className="rounded-2xl bg-surface border border-border p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-ink-soft font-semibold">
              <Icon name="card" size={14} /> Trésorerie espèces
            </div>
            <div className="mt-3 space-y-2">
              <LigneCle label="Fond de caisse (ouverture)" valeur={formatEUR(cashSummary.opening_float ?? 0)} />
              <LigneCle label="Ventes espèces" valeur={formatEUR(cashSummary.cash_sales)} />
              {cashSummary.bank_deposits > 0 && (
                <LigneCle label="Remise en banque" valeur={`-${formatEUR(cashSummary.bank_deposits)}`} ton="warning" />
              )}
              {(cashSummary.cash_refunds ?? 0) > 0 && (
                <LigneCle label="Remboursements espèces" valeur={`-${formatEUR(cashSummary.cash_refunds ?? 0)}`} ton="warning" />
              )}
              {autresMouvements !== 0 && (
                <LigneCle
                  label="Autres mouvements"
                  valeur={`${autresMouvements > 0 ? '+' : '-'}${formatEUR(Math.abs(autresMouvements))}`}
                  ton="warning"
                />
              )}
              <div className="pt-2 border-t border-border">
                <LigneCle label="Espèces attendues" valeur={formatEUR(cashSummary.expected_cash)} fort />
              </div>
            </div>
          </div>

          <div className="flex-1" />

          {sealedAt ? (
            <a href="/closures"
               className="btn-soft h-12 rounded-2xl flex items-center justify-center gap-2 text-sm"
               title="La journée est déjà clôturée — réimprimer le Z ou réouvrir la journée">
              Journée clôturée — réouvrir / réimprimer le Z
            </a>
          ) : (
            <a href="/closures"
               className="btn-primary h-12 rounded-2xl flex items-center justify-center gap-2 text-sm font-semibold">
              <Icon name="lock" size={16} /> Clôturer la journée
            </a>
          )}
        </aside>

        {/* ------------------------------------------------------ CONTENU */}
        <main className="md:overflow-y-auto p-3 md:p-4">
          {selected ? (
            <div className="space-y-3">
              <button
                onClick={() => { setSelected(null); setDetail(null); }}
                className="btn-ghost text-sm"
              >
                ‹ Retour à la journée
              </button>
              {loadingDetail ? (
                <div className="card p-10 text-center text-ink-soft text-sm">Chargement…</div>
              ) : detail ? (
                <SaleDetailPanel
                  detail={detail}
                  onInvoiceGenerated={() => {
                    void pickSale(detail.sale.id);
                    reloadDay(false); // rafraîchit CA / badges sans fermer le détail
                  }}
                />
              ) : (
                <EmptyState icon="⚠" title="Erreur de chargement" />
              )}
            </div>
          ) : mode === 'complet' ? (
            /* Rapport de caisse (X complet, identique au Z) */
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button onClick={() => setMode('simple')} className="btn-ghost text-sm">
                  ‹ Retour à la journée
                </button>
                <div className="ml-auto flex items-center gap-2">
                  {dayReport?.store_name && (
                    <span className="text-xs text-ink-soft">
                      Boutique : <span className="font-medium text-ink">{dayReport.store_name}</span>
                    </span>
                  )}
                  <button onClick={() => void printX()} disabled={printingX}
                          className="btn-soft text-sm h-10 px-3 inline-flex items-center gap-2 disabled:opacity-50">
                    <Icon name="print" size={16} /> {printingX ? 'Impression…' : 'Imprimer le X'}
                  </button>
                </div>
              </div>
              {sealedAt && (
                <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white"
                     style={{ backgroundColor: 'var(--primary)' }}>
                  Journée fermée — {new Date(sealedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
              <div className="card p-5">
                {loadingReport || !dayReport
                  ? <p className="text-sm text-ink-soft">Chargement du rapport…</p>
                  : <DayReportView report={dayReport} />}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Recherche / scan de ticket */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft">
                    <Icon name="search" size={16} />
                  </span>
                  <input
                    ref={champRecherche}
                    className="input h-11 pl-10"
                    placeholder="Rechercher ou scanner un numéro de ticket…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && search.trim()) {
                        // Tente d'abord un scan exact (toutes dates)
                        const r = await fetch(
                          `/api/sales/today?scan=${encodeURIComponent(search.trim())}`,
                        );
                        if (r.ok) {
                          const j = await r.json();
                          if (j.sales?.[0]?.id) {
                            await pickSale(j.sales[0].id);
                            setSearch('');
                          }
                        }
                      }
                    }}
                  />
                </div>
                <span className="text-sm text-ink-soft whitespace-nowrap">
                  {filtered.length} ticket(s)
                </span>
              </div>

              {/* Cinq chiffres de la journée */}
              {/* Les paliers sont décalés d'un cran : la colonne de journée
                  mange 320 px, la zone utile est bien plus étroite que la
                  fenêtre — à 1180 px, cinq tuiles couperaient les montants. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-3">
                <Tuile icone="card" pleine label="CA TTC" valeur={formatEUR(totals.netTtc)}
                       note={ecartLabel(totals.netTtc, veille?.ttc)} />
                <Tuile icone="cart" label="Ventes" valeur={totals.count.toString()}
                       note={ecartLabel(totals.count, veille?.count)} />
                <Tuile icone="stock" label="Panier moyen" valeur={formatEUR(totals.avg)}
                       note={ecartLabel(totals.avg, veille?.avg)} />
                <Tuile icone="invoices" label="Tickets" valeur={ticketsEmis.toString()}
                       note={ecartLabel(ticketsEmis, veille?.tickets)} />
                <Tuile icone="pos" texte label="Top paiement" valeur={topPaiement?.label ?? '—'}
                       note={topPaiement ? formatEUR(topPaiement.montant) : 'Aucune vente'} />
              </div>

              {/* Tickets du jour : la liste ne s'affiche que s'il y en a. */}
              {filtered.length > 0 && (
                <div className="card overflow-hidden">
                  <div className="max-h-[22rem] overflow-y-auto overflow-x-auto">
                    <table className="w-full text-sm min-w-[26rem]">
                      <thead className="text-ink-soft text-[10px] uppercase tracking-widest border-b border-border sticky top-0 bg-surface">
                        <tr>
                          <th className="text-left px-4 py-3 font-semibold">Ticket</th>
                          <th className="text-left px-4 py-3 font-semibold">Vente</th>
                          <th className="text-left px-4 py-3 font-semibold">Vendeur</th>
                          <th className="text-right px-4 py-3 font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((s) => (
                          <tr
                            key={s.id}
                            onClick={() => void pickSale(s.id)}
                            className="border-t border-border hover:bg-gray-50 cursor-pointer"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-medium">{s.receipt_number}</span>
                                {s.status === 'cancelled_by_credit_note' ? (
                                  <span className="rounded-full bg-danger/10 text-danger px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">
                                    Annulée
                                  </span>
                                ) : Number(s.refunded_total) > 0 ? (
                                  <span className="rounded-full bg-warning/10 text-warning px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">
                                    Retour −{formatEUR(Number(s.refunded_total))}
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-xs text-ink-soft">
                                {new Date(s.validated_at).toLocaleTimeString('fr-FR', {
                                  hour: '2-digit', minute: '2-digit', second: '2-digit',
                                })}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-ink-soft">{s.customer ?? '—'}</td>
                            <td className="px-4 py-3 text-ink-soft">{s.cashier}</td>
                            <td className={`px-4 py-3 text-right font-medium ${
                              s.status === 'cancelled_by_credit_note' ? 'line-through text-ink-soft' : ''
                            }`}>{formatEUR(Number(s.total_ttc))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {loading && filtered.length === 0 && (
                <div className="card p-6 text-center text-ink-soft text-sm">Chargement…</div>
              )}

              {/* Courbe du jour + répartition des encaissements */}
              <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4">
                <section className="card p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-semibold">Évolution du CA TTC</h2>
                    <select
                      className="input h-9 w-auto text-sm"
                      value={vueCourbe}
                      onChange={(e) => setVueCourbe(e.target.value as 'heure' | 'cumule')}
                    >
                      <option value="heure">Par heure</option>
                      <option value="cumule">Cumulé</option>
                    </select>
                  </div>
                  <div className="mt-3">
                    <CourbeJournee valeurs={courbe} vide={totals.ttc === 0} />
                  </div>
                </section>

                <section className="card p-5">
                  <h2 className="font-semibold">Répartition des ventes</h2>
                  <div className="mt-4">
                    <AnneauPaiements parts={paiements} />
                  </div>
                </section>
              </div>

              {/* Catégories, commandes, actions */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <section className="card p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-semibold">Top catégories (CA TTC)</h2>
                    <span className="text-xs text-ink-soft whitespace-nowrap">{dateCourte}</span>
                  </div>
                  {topCategories.length === 0 ? (
                    <div className="py-8">
                      <EtatVide icone="tag" titre="Aucune donnée"
                                texte="Aucune vente par catégorie pour cette période." />
                    </div>
                  ) : (
                    <ul className="mt-4 space-y-3">
                      {topCategories.map((c) => (
                        <li key={c.name}>
                          <div className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="truncate">{c.name}</span>
                            <span className="tabular-nums font-medium">{formatEUR(c.ca_ttc)}</span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full"
                                 style={{
                                   width: `${maxCategorie > 0 ? (c.ca_ttc / maxCategorie) * 100 : 0}%`,
                                   backgroundColor: 'var(--primary)',
                                 }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="card p-5 flex flex-col">
                  <h2 className="font-semibold">Dernières commandes</h2>
                  {commandes.length === 0 ? (
                    <div className="py-8">
                      <EtatVide icone="doc" titre="Aucune commande"
                                texte="Aucune commande enregistrée récemment." />
                    </div>
                  ) : (
                    <ul className="mt-3 divide-y divide-border">
                      {commandes.map((c) => (
                        <li key={c.id} className="py-2.5 flex items-baseline justify-between gap-2 text-sm">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{c.customer_name ?? c.recipient_name ?? 'Client comptoir'}</div>
                            <div className="text-xs text-ink-soft">
                              {c.number} · {c.requested_at
                                ? new Date(c.requested_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
                                : '—'}
                            </div>
                          </div>
                          <span className="tabular-nums whitespace-nowrap">{formatEUR(Number(c.total_amount ?? 0))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex-1" />
                  <a href="/orders" className="btn-soft h-10 mt-3 flex items-center justify-center text-sm">
                    Voir toutes les commandes
                  </a>
                </section>

                <section className="rounded-2xl bg-accent-soft p-5">
                  <div className="flex items-center gap-2 font-semibold">
                    <Icon name="sparkle" size={16} /> Actions rapides
                  </div>
                  <div className="mt-3 space-y-2">
                    <ActionRapide icone="cart" label="Nouvelle vente" href="/caisse" />
                    <ActionRapide icone="pos" label={tiroir ?? 'Ouvrir le tiroir caisse'}
                                  onClick={() => void ouvrirTiroir()} />
                    <ActionRapide icone="search" label="Recherche avancée"
                                  onClick={() => champRecherche.current?.focus()} />
                    <ActionRapide icone="print" label="Rapport de caisse"
                                  onClick={() => setMode('complet')} />
                  </div>
                </section>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/** Ligne « libellé … valeur » des cartes de synthèse. */
function LigneCle({ label, valeur, fort, ton }: {
  label: string; valeur: string; fort?: boolean; ton?: 'warning';
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-ink-soft">{label}</span>
      <span className={`tabular-nums whitespace-nowrap ${
        fort ? 'font-semibold text-accent-deep' : ton === 'warning' ? 'text-warning' : 'font-medium'
      }`}>{valeur}</span>
    </div>
  );
}

/** Tuile d'indicateur : pastille, libellé, chiffre, comparaison. */
function Tuile({ icone, label, valeur, note, pleine, texte }: {
  icone: IconName; label: string; valeur: string; note: string;
  pleine?: boolean;
  /** Valeur en toutes lettres (« Carte bancaire ») : elle a besoin de plus de
   *  place qu'un montant, on la pose un cran plus petit pour ne pas la couper. */
  texte?: boolean;
}) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <span
        className={`h-11 w-11 shrink-0 rounded-full grid place-items-center ${
          pleine ? 'text-white' : 'bg-muted text-accent-deep'
        }`}
        style={pleine ? { backgroundColor: 'var(--primary)' } : undefined}
      >
        <Icon name={icone} size={20} />
      </span>
      {/* flex-1 : sans lui la colonne se fait écraser par la pastille et le
          montant se coupe (« 530,3… ») dès qu'on descend sous le grand écran. */}
      <div className="min-w-0 flex-1">
        <div className="text-xs text-ink-soft truncate">{label}</div>
        <div className={`font-semibold tracking-tight ${
          texte ? 'text-sm leading-tight break-words' : 'text-xl tabular-nums truncate'
        }`} title={valeur}>{valeur}</div>
        <div className="text-[11px] text-ink-soft truncate">{note}</div>
      </div>
    </div>
  );
}

/** Entrée du panneau « Actions rapides ». */
function ActionRapide({ icone, label, href, onClick }: {
  icone: IconName; label: string; href?: string; onClick?: () => void;
}) {
  const contenu = (
    <>
      <span className="text-accent-deep"><Icon name={icone} size={18} /></span>
      <span className="flex-1 text-left truncate">{label}</span>
      <span className="text-ink-soft">›</span>
    </>
  );
  const classe = 'w-full h-11 px-3 rounded-xl bg-surface flex items-center gap-2.5 text-sm font-medium hover:brightness-95';
  return href
    ? <a href={href} className={classe}>{contenu}</a>
    : <button type="button" onClick={onClick} className={classe}>{contenu}</button>;
}

/**
 * Actions sur le ticket d'une vente passée : réimpression (ouvre le PDF et
 * déclenche l'impression) et renvoi par email (à l'email du client, ou saisi
 * à la volée si absent).
 */
function ReceiptActions({ saleId, receiptNumber, onReprint, onSent, onError }: {
  saleId: string;
  receiptNumber: string;
  onReprint: () => void;
  onSent: (email: string) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function resend(email?: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/receipts/by-sale/${saleId}/email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(email ? { email } : {}),
      });
      if (!r.ok) {
        if (r.status === 422) {
          // Pas d'email client : on le demande.
          const entered = await promptThemed({
            title: 'Renvoyer le ticket',
            message: `Adresse email pour le ticket ${receiptNumber} :`,
            placeholder: 'client@exemple.fr',
          });
          if (entered && entered.includes('@')) { await resend(entered.trim()); }
          return;
        }
        onError('Envoi du ticket impossible.');
        return;
      }
      const j = await r.json();
      if (j.delivered === false) { onError(j.send_error || 'Email non envoyé (vérifier la configuration).'); return; }
      onSent(j.email);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button onClick={onReprint} className="btn-soft text-xs whitespace-nowrap" title="Réimprimer le ticket sur l'imprimante">
        Réimprimer
      </button>
      <button onClick={() => void resend()} disabled={busy}
              className="btn-soft text-xs whitespace-nowrap disabled:opacity-40" title="Renvoyer le ticket par email">
        {busy ? 'Envoi…' : '✉ Renvoyer'}
      </button>
    </>
  );
}

function SendInvoiceButton({
  invoiceId, invoiceNumber, onSent,
}: {
  invoiceId: string;
  invoiceNumber: string;
  onSent: (email: string) => void;
}) {
  const [sending, setSending] = useState(false);
  const [showModal, setShowModal] = useState(false);

  async function trigger(email?: string) {
    setSending(true);
    const r = await fetch(`/api/invoices/${invoiceId}/email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(email ? { email } : {}),
    });
    setSending(false);
    if (!r.ok) {
      if (r.status === 400) {
        // Pas d'email sur le client → modale pour le saisir
        setShowModal(true);
        return;
      }
      return;
    }
    const j = await r.json();
    onSent(j.email);
    setShowModal(false);
  }

  return (
    <>
      <button
        onClick={() => void trigger()}
        disabled={sending}
        className="btn-primary text-xs whitespace-nowrap"
      >
        {sending ? 'Envoi…' : `✉ Envoyer facture`}
      </button>
      {showModal && (
        <InlineEmailModal
          invoiceNumber={invoiceNumber}
          busy={sending}
          onClose={() => setShowModal(false)}
          onSend={(email) => void trigger(email)}
        />
      )}
    </>
  );
}

function InlineEmailModal({ invoiceNumber, busy, onClose, onSend }: {
  invoiceNumber: string;
  busy: boolean;
  onClose: () => void;
  onSend: (email: string) => void;
}) {
  const [email, setEmail] = useState('');
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl lg:max-w-4xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Envoyer la facture</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>
        <p className="text-sm text-ink-soft mb-3">
          Renseignez l&apos;adresse pour envoyer la facture <strong className="text-ink">{invoiceNumber}</strong>.
          Elle sera enregistrée sur la fiche client.
        </p>
        <label className="text-sm font-medium text-ink-soft">Email</label>
        <input type="email" autoFocus className="input mt-1" value={email}
               onChange={(e) => setEmail(e.target.value)} placeholder="client@exemple.fr" />
        <button
          onClick={() => onSend(email.trim())}
          disabled={busy || !email.includes('@')}
          className="btn-primary w-full mt-4 h-11"
        >
          {busy ? 'Envoi…' : 'Envoyer'}
        </button>
      </div>
    </div>
  );
}

function KpiRow({ label, value, tone }: {
  label: string;
  value: string;
  tone?: 'warning' | 'accent';
}) {
  const cls = tone === 'warning' ? 'text-warning'
    : tone === 'accent' ? 'text-accent-deep'
    : '';
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-ink-soft">{label}</span>
      <span className={`text-base font-semibold ${cls}`}>{value}</span>
    </div>
  );
}

function SaleDetailPanel({ detail, onInvoiceGenerated }: {
  detail: SaleDetail;
  onInvoiceGenerated: () => void;
}) {
  const s = detail.sale;
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReturn, setShowReturn] = useState(false);
  const [creditNote, setCreditNote] = useState<{ id: string; number: string; amount: number } | null>(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [showGiftPicker, setShowGiftPicker] = useState(false);

  const receiptApiBase = `/api/receipts/by-sale/${s.id}`;
  const receiptPdfUrl = `/api/receipts/by-sale/${s.id}/pdf`;

  async function printTicket(gift: boolean, lines: number[] | null = null) {
    const res = await printReceipt({ base: receiptApiBase, pdfUrl: receiptPdfUrl, gift, lines });
    setInfo(res.message);
    setTimeout(() => setInfo(null), 3000);
  }

  // Ticket sans prix : un seul article → impression directe ; sinon sélecteur.
  function onGiftClick() {
    if (detail.lines.length <= 1) { void printTicket(true); return; }
    setShowGiftPicker(true);
  }

  const paymentsByMethod = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of detail.payments) {
      map.set(p.method, (map.get(p.method) ?? 0) + Number(p.amount));
    }
    return Array.from(map.entries())
      .filter(([, v]) => Math.abs(v) > 0.005)
      .map(([method, amount]) => ({ method, amount: Number(amount.toFixed(2)) }));
  }, [detail.payments]);

  // Vente entièrement retournée ? (statut annulé, ou toutes les quantités
  // déjà rendues) → le bouton « Retour produit » est désactivé.
  const returnedByLine = detail.returned_by_line ?? {};
  const hasReturns = Object.values(returnedByLine).some((q) => Number(q) > 0);
  const fullyReturned =
    s.status === 'cancelled_by_credit_note' ||
    (detail.lines.length > 0 && detail.lines.every(
      (l) => (returnedByLine[l.line_index] ?? 0) >= Number(l.quantity) - 0.0001,
    ));

  // Marge sur les lignes ayant un product_purchase_price_ht connu.
  const marginInfo = useMemo(() => {
    let costHt = 0, revenueHt = 0, withCost = 0, total = detail.lines.length;
    for (const l of detail.lines) {
      const purchase = Number(l.product_purchase_price_ht ?? 0);
      if (purchase > 0) {
        withCost += 1;
        costHt += purchase * Number(l.quantity);
        revenueHt += Number(l.line_ht);
      }
    }
    if (withCost === 0) return null;
    const margin = revenueHt - costHt;
    const pct = revenueHt > 0 ? (margin / revenueHt) * 100 : 0;
    return { margin, costHt, revenueHt, pct, withCost, total };
  }, [detail.lines]);

  async function generateInvoice() {
    setGenerating(true); setError(null);
    const res = await fetch(`/api/sales/${s.id}/invoice`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    setGenerating(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? 'Erreur');
      return;
    }
    onInvoiceGenerated();
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-sm text-ink-soft">{s.receipt_number}</div>
            <div className="text-2xl font-semibold tracking-tight">{formatEUR(Number(s.total_ttc))}</div>
            <div className="text-xs text-ink-soft mt-1">
              {new Date(s.validated_at).toLocaleString('fr-FR')}
              {' · '}Vendeur : {s.cashier}
              {s.customer && <> · Client : {s.customer}</>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <button onClick={() => void printTicket(false)}
                 className="btn-soft text-xs whitespace-nowrap"
                 title="Imprimer le ticket (repli PDF si aucune imprimante configurée)">
                Imprimer le ticket
              </button>
              <button onClick={onGiftClick} className="btn-soft text-xs whitespace-nowrap"
                      title="Imprimer un ticket sans prix (choix des articles si plusieurs)">
                Ticket sans prix
              </button>
              <ReceiptActions
                saleId={s.id}
                receiptNumber={s.receipt_number}
                onReprint={() => void printTicket(false)}
                onSent={(email) => setInfo(`Ticket renvoyé à ${email}`)}
                onError={(m) => setError(m)}
              />
            </div>
            {detail.invoice ? (
              <div className="flex flex-col items-end gap-1.5">
                <a href={`/api/invoices/${detail.invoice.id}/pdf`} target="_blank" rel="noreferrer"
                   className="btn-soft text-xs whitespace-nowrap">
                  Imprimer facture {detail.invoice.number}
                </a>
                <SendInvoiceButton
                  invoiceId={detail.invoice.id}
                  invoiceNumber={detail.invoice.number}
                  onSent={(email) => setInfo(`Facture envoyée à ${email}`)}
                />
              </div>
            ) : s.customer_id ? (
              <button onClick={() => void generateInvoice()} disabled={generating}
                      className="btn-primary text-xs whitespace-nowrap">
                {generating ? 'Génération…' : 'Générer facture'}
              </button>
            ) : null}
          </div>
        </div>
        {!s.customer_id && !detail.invoice && (
          <p className="mt-3 text-xs text-ink-soft">
            Aucun client attaché — la génération de facture nécessite un client identifié.
          </p>
        )}
        {error && <div className="mt-2 text-xs text-danger">{error}</div>}
        {info && <div className="mt-2 rounded-xl bg-success/10 px-3 py-2 text-xs text-success">{info}</div>}

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => setShowCorrection(true)} className="btn-soft text-sm">
            ⇄ Changer règlement
          </button>
          <button
            onClick={() => setShowReturn(true)}
            disabled={fullyReturned}
            title={fullyReturned ? 'Tous les articles de cette vente ont déjà été retournés.' : undefined}
            className="btn-soft text-sm text-danger disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ↩ Retour produit{fullyReturned ? ' (déjà retourné)' : ''}
          </button>
          {!s.customer_id && (
            <button onClick={() => setShowAttach(true)} className="btn-soft text-sm">
              + Attribuer un client
            </button>
          )}
          {s.status === 'cancelled_by_credit_note' ? (
            <span className="inline-flex items-center rounded-lg bg-danger/10 px-3 py-1.5 text-sm font-medium text-danger">
              Vente annulée
            </span>
          ) : (
            <button
              onClick={() => setShowCancel(true)}
              disabled={hasReturns}
              title={
                detail.invoice?.period ? 'Émet une facture d’avoir pour cette vente et référence la facture de période (celle-ci reste valable pour les autres ventes).'
                : detail.invoice ? 'Annule la vente et émet une facture d’avoir contre-passant la facture.'
                : hasReturns ? 'Un retour a déjà eu lieu sur cette vente.'
                : undefined
              }
              className="btn-soft text-sm text-danger disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ✕ {detail.invoice ? 'Annuler (avoir de facture)' : 'Annuler la vente'}
            </button>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm">Articles ({detail.lines.length})</h3>
        </div>
        {/* Défilement horizontal sur mobile : le tableau (6 colonnes) ne
            déborde plus de l'écran, il glisse dans sa carte. */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[34rem]">
            <thead className="text-ink-soft text-xs uppercase">
              <tr>
                <th className="text-left px-3 py-2">Article</th>
                <th className="text-right px-3 py-2">Qté</th>
                <th className="text-right px-3 py-2">PU TTC</th>
                <th className="text-right px-3 py-2">Remise</th>
                <th className="text-right px-3 py-2">TVA</th>
                <th className="text-right px-3 py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {detail.lines.map((l) => (
                <tr key={l.line_index} className="border-t border-border">
                  <td className="px-3 py-2">{l.label}</td>
                  <td className="px-3 py-2 text-right">{l.quantity}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{formatEUR(Number(l.unit_price_ttc))}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {Number(l.discount_amount) > 0
                      ? <span className="text-warning">-{formatEUR(Number(l.discount_amount))}</span>
                      : <span className="text-ink-soft">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-ink-soft">{l.tax_rate}%</td>
                  <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{formatEUR(Number(l.line_ttc))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="font-semibold text-sm mb-3">Récapitulatif TVA</h3>
          <table className="w-full text-sm">
            <tbody>
              {(s.tva_breakdown ?? []).map((b, i) => (
                <tr key={i} className="border-t border-border first:border-t-0">
                  <td className="py-2">TVA {b.rate}%</td>
                  <td className="py-2 text-right text-ink-soft">Base {formatEUR(b.base_ht)}</td>
                  <td className="py-2 text-right">{formatEUR(b.tva)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 pt-3 border-t border-border space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-ink-soft">Total HT</span><span>{formatEUR(Number(s.total_ht))}</span></div>
            <div className="flex justify-between"><span className="text-ink-soft">Total TVA</span><span>{formatEUR(Number(s.total_tva))}</span></div>
            {Number(s.total_discount) > 0 && (
              <div className="flex justify-between text-warning">
                <span>Remises totales</span><span>-{formatEUR(Number(s.total_discount))}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between pt-1 border-t border-border">
              <span className="font-semibold">Total TTC</span>
              <span className="text-xl font-semibold">{formatEUR(Number(s.total_ttc))}</span>
            </div>
            {marginInfo && (
              <div className="pt-2 mt-2 border-t border-border space-y-1">
                <div className="flex justify-between text-xs text-ink-soft">
                  <span>Coût d&apos;achat</span><span>{formatEUR(marginInfo.costHt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Marge brute</span>
                  <span className={`font-semibold ${marginInfo.margin > 0 ? 'text-success' : 'text-danger'}`}>
                    {formatEUR(marginInfo.margin)} ({marginInfo.pct.toFixed(1)}%)
                  </span>
                </div>
                {marginInfo.withCost < marginInfo.total && (
                  <div className="text-[11px] text-ink-soft italic">
                    Marge calculée sur {marginInfo.withCost}/{marginInfo.total} ligne(s)
                    (prix d&apos;achat manquant pour le reste).
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-sm mb-3">Modes de règlement</h3>
          {paymentsByMethod.length === 0 ? (
            <p className="text-sm text-ink-soft">Aucun paiement.</p>
          ) : (
            <ul className="space-y-2">
              {paymentsByMethod.map((p) => (
                <li key={p.method} className="flex items-center justify-between text-sm border-b border-border/60 pb-2 last:border-0">
                  <Badge tone="soft">{PAYMENT_LABELS[p.method] ?? p.method}</Badge>
                  <span className="font-medium">{formatEUR(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          {paymentsByMethod.some((p) => p.amount > 0) && (
            <button
              onClick={() => setShowCorrection(true)}
              className="mt-3 w-full btn-ghost text-xs"
            >
              ⇄ Changer le règlement
            </button>
          )}
          {detail.payments.some((p) => Number(p.amount) < 0) && (
            <p className="mt-2 text-[11px] text-ink-soft italic">
              Une ou plusieurs corrections ont été appliquées sur cette vente.
            </p>
          )}
        </div>
      </div>

      {creditNote && (
        <div className="rounded-xl bg-danger/10 px-4 py-3 text-sm flex items-center justify-between">
          <span>
            <span className="font-semibold text-danger">Avoir {creditNote.number}</span>
            <span className="text-ink-soft ml-2">émis pour {formatEUR(creditNote.amount)}</span>
          </span>
          <a href={`/api/credit-notes/${creditNote.id}/pdf`} target="_blank" rel="noreferrer"
             className="btn-primary text-xs">
            Télécharger l&apos;avoir
          </a>
        </div>
      )}

      {/* Historique des retours / avoirs déjà émis pour cette vente */}
      {detail.returns && detail.returns.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-sm">
              Retours / Avoirs émis ({detail.returns.length})
            </h3>
          </div>
          <ul className="divide-y divide-border">
            {detail.returns.map((cn) => (
              <li key={cn.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-xs font-medium">{cn.number}</span>
                    <span className="text-xs text-ink-soft">
                      {new Date(cn.created_at).toLocaleString('fr-FR')}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="font-semibold text-danger">-{formatEUR(Number(cn.amount))}</span>
                    <span className="text-ink-soft ml-2">· {cn.reason}</span>
                  </div>
                </div>
                <a href={`/api/credit-notes/${cn.id}/pdf`} target="_blank" rel="noreferrer"
                   className="text-accent-deep text-xs hover:underline shrink-0">
                  PDF
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-xs text-ink-soft font-mono px-1">
        Empreinte fiscale : {s.fiscal_hash?.slice(0, 32)}…
      </div>

      {showReturn && (
        <ReturnModal
          saleId={s.id}
          receiptNumber={s.receipt_number}
          lines={detail.lines}
          payments={detail.payments.map((p) => ({ method: p.method, amount: Number(p.amount) }))}
          returnedByLine={returnedByLine}
          onClose={() => setShowReturn(false)}
          onSuccess={(cn) => {
            setCreditNote(cn);
            setShowReturn(false);
            onInvoiceGenerated();
          }}
        />
      )}
      {showCancel && (
        <CancelSaleModal
          saleId={s.id}
          receiptNumber={s.receipt_number}
          amount={Number(s.total_ttc)}
          isInvoiced={!!detail.invoice}
          isPeriodInvoice={!!detail.invoice?.period}
          onClose={() => setShowCancel(false)}
          onSuccess={(number) => {
            setShowCancel(false);
            setInfo(detail.invoice
              ? `Vente annulée · facture d’avoir ${number} émise (voir Factures).`
              : `Vente annulée · avoir ${number} émis.`);
            setTimeout(() => setInfo(null), 6000);
            onInvoiceGenerated();
          }}
        />
      )}
      {showCorrection && (
        <PaymentCorrectionModal
          saleId={s.id}
          paymentsByMethod={paymentsByMethod}
          onClose={() => setShowCorrection(false)}
          onSuccess={() => {
            setShowCorrection(false);
            setInfo('Règlement corrigé. Une trace fiscale a été inscrite.');
            setTimeout(() => setInfo(null), 4000);
            onInvoiceGenerated();
          }}
        />
      )}
      {showAttach && (
        <AttachCustomerAfterSaleModal
          saleId={s.id}
          onClose={() => setShowAttach(false)}
          onSuccess={(loyalty) => {
            setShowAttach(false);
            setInfo(
              loyalty?.earned
                ? `Client attribué · +${loyalty.earned} € de fidélité crédités (solde ${loyalty.new_balance} €)`
                : 'Client attribué.',
            );
            setTimeout(() => setInfo(null), 4000);
            onInvoiceGenerated();
          }}
        />
      )}
      {showGiftPicker && (
        <GiftReceiptPickerModal
          lines={detail.lines.map((l) => ({ label: l.label, quantity: l.quantity }))}
          pdfBaseUrl={receiptPdfUrl}
          onPrint={(indices) => void printTicket(true, indices)}
          onClose={() => setShowGiftPicker(false)}
        />
      )}
    </div>
  );
}

function CancelSaleModal({ saleId, receiptNumber, amount, isInvoiced, isPeriodInvoice, onClose, onSuccess }: {
  saleId: string; receiptNumber: string; amount: number; isInvoiced?: boolean; isPeriodInvoice?: boolean;
  onClose: () => void; onSuccess: (creditNoteNumber: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ERR: Record<string, string> = {
    SALE_NOT_CANCELABLE: 'Cette vente ne peut plus être annulée.',
    SALE_INVOICED: 'Vente rattachée à une facture de période (« en compte ») : annulation impossible ici.',
    SALE_HAS_RETURNS: 'Un retour a déjà eu lieu sur cette vente.',
    REASON_REQUIRED: 'Indiquez un motif.',
  };

  async function confirm() {
    if (!reason.trim()) { setError('Indiquez un motif.'); return; }
    setBusy(true); setError(null);
    const r = await fetch(`/api/sales/${saleId}/cancel-validated`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    setBusy(false);
    if (r.ok) {
      const j = await r.json();
      onSuccess(j.number as string);
    } else {
      const j = await r.json().catch(() => null);
      setError(ERR[j?.error] ?? j?.error ?? 'Échec de l’annulation.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && onClose()}>
      <div className="card w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-danger">Annuler la vente {receiptNumber}</h3>
        <p className="text-sm text-ink-soft">
          Cette action contre-passe l’intégralité de la vente ({formatEUR(amount)}) : articles,
          tous les modes de règlement et la fidélité. Un avoir est émis et la vente est marquée
          « annulée ». Opération irréversible.
        </p>
        {isInvoiced && !isPeriodInvoice && (
          <p className="rounded-xl bg-warning/10 px-3 py-2 text-sm text-warning">
            Cette vente est <strong>facturée</strong> : une <strong>facture d’avoir</strong>
            {' '}sera automatiquement émise pour contre-passer la facture, et la facture
            d’origine sera marquée « annulée ». Retrouvez-la dans <strong>Factures</strong>.
          </p>
        )}
        {isPeriodInvoice && (
          <p className="rounded-xl bg-warning/10 px-3 py-2 text-sm text-warning">
            Cette vente fait partie d’une <strong>facture de période</strong> («&nbsp;en compte&nbsp;»)
            {' '}qui regroupe plusieurs ventes. Une <strong>facture d’avoir</strong> sera émise pour
            {' '}la part de cette vente et référencera la facture de période ; celle-ci
            {' '}<strong>reste valable</strong> pour les autres ventes. Retrouvez l’avoir dans
            {' '}<strong>Factures</strong>.
          </p>
        )}
        <label className="block text-sm">
          <span className="text-ink-soft">Motif de l’annulation</span>
          <textarea
            autoFocus className="input w-full mt-1 min-h-[80px]" value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex. erreur de saisie, client s’est ravisé…"
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary h-10 px-4" disabled={busy} onClick={onClose}>Retour</button>
          <button className="btn-primary h-10 px-4 !bg-danger" disabled={busy} onClick={() => void confirm()}>
            {busy ? '…' : 'Annuler la vente'}
          </button>
        </div>
      </div>
    </div>
  );
}
