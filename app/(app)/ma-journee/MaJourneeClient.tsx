'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import { PAYMENT_LABELS } from '@/components/labels';
import EmptyState from '@/components/EmptyState';
import Badge from '@/components/Badge';
import Icon from '@/components/Icon';
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

export default function MaJourneeClient() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [sales, setSales] = useState<Sale[]>([]);
  const [cashSummary, setCashSummary] = useState<{
    cash_sales: number; bank_deposits: number; cash_refunds?: number; expected_cash: number;
  }>({ cash_sales: 0, bank_deposits: 0, cash_refunds: 0, expected_cash: 0 });
  const [returnsTotal, setReturnsTotal] = useState(0);
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
        setOpenedAt(j.opened_at ?? null);
      })
      .finally(() => setLoading(false));
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

  // Charge le rapport X complet quand on passe en mode complet (ou change de date).
  useEffect(() => {
    if (mode !== 'complet') return;
    setLoadingReport(true);
    setDayReport(null);
    void fetch(`/api/reports/day?date=${date}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.report) setDayReport(j.report as DayReport); })
      .finally(() => setLoadingReport(false));
  }, [mode, date]);

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

  return (
    <div className="flex flex-col md:h-full md:overflow-hidden min-h-full">
      <div className="px-6 md:px-8 pt-6 md:pt-8 pb-4 shrink-0 border-b border-border">
        <PageHeader
          title="Ma journée"
          subtitle={`${dateLabel} · ${totals.count} vente(s) ce jour`}
          actions={
            <label className="inline-flex items-center gap-2 cursor-pointer relative rounded-xl border border-border px-3 h-10 text-sm text-ink-soft hover:bg-gray-50">
              <input
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <Icon name="my-day" size={18} /> Changer de date
            </label>
          }
        />
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[360px_1fr] md:overflow-hidden">
      {/* SIDEBAR GAUCHE — synthèse journée */}
      <aside className="border-r border-border bg-white overflow-y-auto flex flex-col">
        {/* Switch X Simple / X Complet */}
        <div className="px-5 pt-4">
          {/* Heure d'ouverture de la caisse, juste au-dessus des boutons X. */}
          {openedAt && (
            <div className="mb-2 text-center text-xs text-ink-soft">
              Caisse ouverte à{' '}
              <span className="font-semibold text-ink">
                {new Date(openedAt).toLocaleTimeString('fr-FR', {
                  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
                })}
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-gray-50 p-1">
            <button
              onClick={() => setMode('simple')}
              className={`rounded-xl py-2 text-sm font-medium transition-colors ${
                mode === 'simple' ? 'bg-white shadow-sm text-ink' : 'text-ink-soft'
              }`}
            >
              X Simple
            </button>
            <button
              onClick={() => setMode('complet')}
              className={`rounded-xl py-2 text-sm font-medium transition-colors ${
                mode === 'complet' ? 'bg-white shadow-sm text-ink' : 'text-ink-soft'
              }`}
            >
              X Complet
            </button>
          </div>
        </div>

        {mode === 'complet' ? (
          /* X Complet : rapport détaillé identique au Z */
          <div className="px-5 py-4">
            {sealedAt && (
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white"
                   style={{ backgroundColor: 'var(--primary)' }}>
                Journée fermée — {new Date(sealedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
            {loadingReport || !dayReport
              ? <p className="text-sm text-ink-soft">Chargement du rapport…</p>
              : <DayReportView report={dayReport} />}
          </div>
        ) : (
          <>
            {/* Total TTC mis en avant + indicateur journée fermée */}
            <div className="px-5 py-6 text-center">
              <div className="inline-flex items-center gap-1 text-xs text-ink-soft">
                <Icon name="dashboard" size={14} /> CA TTC
              </div>
              <div className="mt-1 text-4xl font-semibold tracking-tight">{formatEUR(totals.netTtc)}</div>
              {returnsTotal > 0 && (
                <div className="mt-1 text-xs text-ink-soft">
                  {formatEUR(totals.ttc)} de ventes − {formatEUR(returnsTotal)} de retours
                </div>
              )}
              {sealedAt && (
                <div
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white"
                  style={{ backgroundColor: 'var(--primary)' }}
                >
                  Journée fermée — {new Date(sealedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>

            {/* KPI lignes */}
            <div className="px-5 pb-4 space-y-3">
              <KpiRow label="CA HT" value={formatEUR(totals.ht)} />
              <KpiRow label="Ventes" value={totals.count.toString()} />
              {returnsTotal > 0 && (
                <KpiRow label="Retours / avoirs" value={`-${formatEUR(returnsTotal)}`} tone="warning" />
              )}
              <KpiRow label="Panier moyen" value={formatEUR(totals.avg)} />
              {/* Trésorerie : ventes espèces / remise banque / espèces attendues */}
              <div className="pt-2 border-t border-border space-y-2">
                <div className="text-[10px] uppercase tracking-widest text-ink-soft font-semibold">
                  Trésorerie espèces
                </div>
                <KpiRow label="Ventes espèces" value={formatEUR(cashSummary.cash_sales)} />
                {cashSummary.bank_deposits > 0 && (
                  <KpiRow
                    label="Remise en banque"
                    value={`-${formatEUR(cashSummary.bank_deposits)}`}
                    tone="warning"
                  />
                )}
                {(cashSummary.cash_refunds ?? 0) > 0 && (
                  <KpiRow
                    label="Remboursements espèces"
                    value={`-${formatEUR(cashSummary.cash_refunds ?? 0)}`}
                    tone="warning"
                  />
                )}
                <KpiRow
                  label="Espèces attendues"
                  value={formatEUR(cashSummary.expected_cash)}
                  tone="accent"
                />
              </div>
            </div>
          </>
        )}

        <div className="flex-1" />

        {/* Action en pied — équivalent du "Actions sur ma journée" */}
        <div className="border-t border-border p-3 bg-white sticky bottom-0 space-y-2">
          {mode === 'complet' && (
            <a
              href={`/api/reports/day/pdf?date=${date}`}
              target="_blank"
              rel="noreferrer"
              className="btn-soft w-full text-sm h-11 flex items-center justify-center gap-2"
            >
              <Icon name="print" size={16} /> Imprimer le X
            </a>
          )}
          {sealedAt ? (
            <a
              href="/closures"
              className="btn-soft w-full text-sm h-11 flex items-center justify-center gap-2"
              title="La journée est déjà clôturée — réimprimer le Z ou réouvrir la journée"
            >
              Journée clôturée — réouvrir / réimprimer le Z
            </a>
          ) : (
            <a
              href="/closures"
              className="btn-primary w-full text-sm h-11 flex items-center justify-center"
            >
              Clôturer la journée
            </a>
          )}
        </div>
      </aside>

      {/* CONTENU — table de tickets / détail */}
      <main className="overflow-y-auto bg-white">
        {!selected ? (
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1 max-w-md">
                <input
                  className="input pr-9"
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
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft">⌕</span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-ink-soft">{filtered.length} ticket(s)</span>
              </div>
            </div>

            {loading ? (
              <div className="card p-10 text-center text-ink-soft text-sm">Chargement…</div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon="☼"
                title="Aucune vente"
                description={sales.length === 0 ? 'Aucun ticket validé pour cette date.' : 'Aucun résultat pour cette recherche.'}
              />
            ) : (
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[26rem]">
                  <thead className="text-ink-soft text-[10px] uppercase tracking-widest border-b border-border">
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
                        <td className="px-4 py-3 text-ink-soft">
                          {s.customer ?? '—'}
                        </td>
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
          </div>
        ) : (
          <div className="p-6">
            <button
              onClick={() => { setSelected(null); setDetail(null); }}
              className="btn-ghost text-sm mb-3"
            >
              ‹ Retour à la liste
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
        )}
      </main>
      </div>
    </div>
  );
}

/**
 * Actions sur le ticket d'une vente passée : réimpression (ouvre le PDF et
 * déclenche l'impression) et renvoi par email (à l'email du client, ou saisi
 * à la volée si absent).
 */
function ReceiptActions({ saleId, receiptNumber, onSent, onError }: {
  saleId: string;
  receiptNumber: string;
  onSent: (email: string) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  function reprint() {
    const w = window.open(`/api/receipts/by-sale/${saleId}/pdf`, '_blank');
    if (w) {
      w.addEventListener('load', () => { try { w.print(); } catch { /* iOS bloque parfois */ } });
    }
  }

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
      <button onClick={reprint} className="btn-soft text-xs whitespace-nowrap" title="Réimprimer le ticket">
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
