'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import { PAYMENT_LABELS } from '@/components/labels';
import StoreScopeSelect from '@/components/StoreScopeSelect';
import PageHeader from '@/components/PageHeader';
import Icon from '@/components/Icon';

/**
 * Rapports du back-office : six lectures d'une même période.
 *
 * Ce qui est entré (ventes, lignes de vente), ce qui est dû (dettes clients),
 * ce qui est ressorti (remboursements, annulations) et ce qui reste engagé
 * envers les clients (avoirs et bons cadeaux).
 *
 * Sur le rapport des ventes, les colonnes de TVA et de moyens de paiement sont
 * construites à partir des données réellement présentes sur la période : une
 * boutique qui ajoute un taux ou un mode de règlement le voit apparaître sans
 * intervention.
 */

type Report = 'sales' | 'lines' | 'debts' | 'refunds' | 'cancellations' | 'vouchers';

interface SalesDay {
  day: string; tickets: number;
  ht: number; tva: number; ttc: number; discount: number;
  margin: number; credit_notes: number;
  vat: Record<string, { base_ht: number; tva: number }>;
  payments: Record<string, number>;
}
interface SalesData {
  days: SalesDay[];
  rates: string[];
  methods: string[];
  totals: {
    tickets: number; ht: number; tva: number; ttc: number; discount: number;
    margin: number; credit_notes: number;
    vat: Record<string, { base_ht: number; tva: number }>;
    payments: Record<string, number>;
  };
}

interface LineRow {
  label: string; sku: string | null; barcode: string | null; category: string | null;
  quantity: number; ht: number; tva: number; ttc: number; discount: number;
  margin: number | null;
}
interface LinesData {
  lines: LineRow[];
  totals: { quantity: number; ht: number; tva: number; ttc: number; discount: number; margin: number };
}

interface DebtRow {
  sale_id: string; receipt: string | null; date: string;
  seller: string | null; customer: string | null; store: string | null;
  ht: number; ttc: number; deferred: number; balance: number | null;
}
interface DebtsData {
  lines: DebtRow[];
  totals: { count: number; ht: number; ttc: number; deferred: number };
}

interface RefundRow {
  id: string; date: string; number: string; receipt: string | null;
  seller: string | null; customer: string | null; store: string | null;
  kind: 'cancellation' | 'return'; reason: string; amount: number;
}
interface RefundsData {
  lines: RefundRow[];
  totals: { count: number; amount: number; cancellations: number; returns: number };
}

interface CancelRow {
  id: string; date: string; cancelled_at: string | null; receipt: string | null;
  seller: string | null; customer: string | null; store: string | null;
  ht: number; ttc: number; reason: string | null;
}
interface CancelData {
  lines: CancelRow[];
  totals: { count: number; ht: number; ttc: number };
}

interface VoucherRow {
  id: string; date: string; type: 'credit_note' | 'gift_card' | 'voucher';
  reference: string; customer: string | null;
  amount: number; remaining: number; expires_at: string | null; status: string;
}
interface VouchersData {
  lines: VoucherRow[];
  totals: { count: number; amount: number; remaining: number };
}

const VOUCHER_LABELS: Record<VoucherRow['type'], string> = {
  credit_note: 'Avoir',
  gift_card: 'Carte cadeau',
  voucher: "Bon d'achat",
};

const REPORTS: Array<{
  key: Report; label: string; icon: 'dashboard' | 'products' | 'customers' | 'loyalty' | 'invoices';
  endpoint: string; help: string;
}> = [
  {
    key: 'sales', label: 'Ventes', icon: 'dashboard', endpoint: 'sales',
    help: "Le chiffre d'affaires réalisé jour par jour sur la période choisie : ventilation de TVA, réductions, marge et encaissements par moyen de règlement.",
  },
  {
    key: 'lines', label: 'Lignes de vente', icon: 'products', endpoint: 'sale-lines',
    help: "Ce qui s'est vendu sur la période, article par article : quantités, chiffre d'affaires et marge.",
  },
  {
    key: 'debts', label: 'Dettes clients', icon: 'customers', endpoint: 'customer-debts',
    help: "Les ventes réglées « en compte ». Le montant du ticket dit d'où vient la dette ; le solde du client dit ce qui reste dû aujourd'hui.",
  },
  {
    key: 'refunds', label: 'Remboursements', icon: 'invoices', endpoint: 'refunds',
    help: "Tout ce qui est sorti de la caisse au profit d'un client : annulations de vente et retours de marchandise, avec leur motif.",
  },
  {
    key: 'cancellations', label: 'Annulations', icon: 'invoices', endpoint: 'cancellations',
    help: "Les ventes validées puis annulées. Une vente validée ne s'efface jamais : elle est contre-passée par un avoir.",
  },
  {
    key: 'vouchers', label: 'Avoirs / Bons cadeaux', icon: 'loyalty', endpoint: 'vouchers',
    help: "Les engagements émis envers vos clients : avoirs, cartes cadeaux et bons d'achat. Le montant restant est ce qui reste exigible.",
  },
];

/**
 * Date au format des champs `<input type="date">`, dans le fuseau de
 * l'utilisateur. `toISOString()` ne convient pas : il bascule en UTC et
 * décale d'un jour en début de matinée depuis la France.
 */
function ymd(d: Date): string {
  const p = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Copie décalée de n jours — sans toucher à la date d'origine. */
function shiftDays(d: Date, days: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + days);
  return c;
}

/** Lundi de la semaine contenant `d` — la semaine française commence lundi. */
function monday(d: Date): Date {
  const c = new Date(d);
  // getDay() : 0 = dimanche. On ramène dimanche à 7 pour compter depuis lundi.
  c.setDate(c.getDate() - ((c.getDay() + 6) % 7));
  return c;
}

/**
 * Périodes courantes, en accès direct.
 *
 * Deux familles volontairement distinctes : les périodes de CALENDRIER
 * (semaine, mois, année en cours ou précédents), qui s'alignent sur des
 * bornes comptables, et les périodes GLISSANTES (« depuis… »), qui remontent
 * d'une durée fixe à partir d'aujourd'hui. Comparer un mois à son précédent
 * n'a de sens qu'avec les premières ; suivre une tendance récente, qu'avec les
 * secondes.
 */
const PRESETS: Array<{ key: string; label: string; range: (today: Date) => { from: string; to: string } }> = [
  {
    key: 'week', label: 'Semaine en cours',
    range: (t) => ({ from: ymd(monday(t)), to: ymd(t) }),
  },
  {
    key: 'prev-week', label: 'Semaine précédente',
    range: (t) => {
      const start = shiftDays(monday(t), -7);
      return { from: ymd(start), to: ymd(shiftDays(start, 6)) };
    },
  },
  {
    key: 'month', label: 'Mois en cours',
    range: (t) => ({ from: ymd(new Date(t.getFullYear(), t.getMonth(), 1)), to: ymd(t) }),
  },
  {
    key: 'prev-month', label: 'Mois précédent',
    range: (t) => ({
      from: ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1)),
      // Jour 0 du mois courant = dernier jour du mois précédent.
      to: ymd(new Date(t.getFullYear(), t.getMonth(), 0)),
    }),
  },
  {
    key: 'last-7', label: 'Depuis une semaine',
    range: (t) => ({ from: ymd(shiftDays(t, -7)), to: ymd(t) }),
  },
  {
    key: 'last-30', label: 'Depuis un mois',
    range: (t) => ({
      from: ymd(new Date(t.getFullYear(), t.getMonth() - 1, t.getDate())),
      to: ymd(t),
    }),
  },
  {
    key: 'year', label: 'Année en cours',
    range: (t) => ({ from: ymd(new Date(t.getFullYear(), 0, 1)), to: ymd(t) }),
  },
  {
    key: 'last-year', label: 'Depuis un an',
    range: (t) => ({
      from: ymd(new Date(t.getFullYear() - 1, t.getMonth(), t.getDate())),
      to: ymd(t),
    }),
  },
];

const DEFAULT_PRESET = 'last-30';

/** Période par défaut à l'ouverture : le mois écoulé. */
function defaultRange(): { from: string; to: string } {
  return PRESETS.find((p) => p.key === DEFAULT_PRESET)!.range(new Date());
}

export default function ReportsClient({ stores }: { stores: { id: string; name: string }[] }) {
  const initial = useMemo(defaultRange, []);
  const [report, setReport] = useState<Report>('sales');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [storeId, setStoreId] = useState<string>('');
  // Le jeu de données ne voyage jamais seul : il porte le rapport dont il
  // provient. Chaque rapport ayant ses propres colonnes, afficher celui d'un
  // autre ne donne pas un tableau bancal — ça casse le rendu. Étiqueter la
  // donnée rend ce mélange impossible, y compris pendant un chargement ou
  // quand une réponse tardive arrive après un changement d'onglet.
  const [loaded, setLoaded] = useState<{ report: Report; payload: Record<string, unknown> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const target = report;
    const seq = ++requestRef.current;
    setLoading(true); setError(null);
    const qs = new URLSearchParams({ from, to });
    if (storeId) qs.set('store_id', storeId);
    try {
      const endpoint = REPORTS.find((x) => x.key === target)!.endpoint;
      const r = await fetch(`/api/reports/${endpoint}?${qs.toString()}`, { cache: 'no-store' });
      if (requestRef.current !== seq) return; // une demande plus récente a pris la main
      if (!r.ok) { setError('Chargement impossible.'); return; }
      const payload = await r.json() as Record<string, unknown>;
      if (requestRef.current !== seq) return;
      setLoaded({ report: target, payload });
    } catch {
      if (requestRef.current === seq) setError('Réseau indisponible.');
    } finally {
      if (requestRef.current === seq) setLoading(false);
    }
  }, [report, from, to, storeId]);

  useEffect(() => { void load(); }, [load]);

  // Rendu strictement conditionné à la correspondance rapport/données.
  const data = loaded && loaded.report === report ? loaded.payload : null;

  const meta = REPORTS.find((r) => r.key === report)!;

  /**
   * Période courante correspondant aux dates affichées, s'il y en a une.
   * Recalculée à chaque rendu plutôt que mémorisée : une saisie manuelle des
   * dates doit éteindre la pastille, et le passage de minuit ne doit pas
   * laisser une pastille allumée sur une période qui a glissé.
   */
  const activePreset = useMemo(() => {
    const today = new Date();
    return PRESETS.find((p) => {
      const r = p.range(today);
      return r.from === from && r.to === to;
    })?.key ?? null;
  }, [from, to]);

  function applyPreset(key: string) {
    const p = PRESETS.find((x) => x.key === key);
    if (!p) return;
    const r = p.range(new Date());
    // Les deux bornes ensemble : `load` ne se déclenche qu'une fois, React
    // regroupant les mises à jour d'un même gestionnaire.
    setFrom(r.from);
    setTo(r.to);
  }

  /* ------------------------------------------------------------- export */

  const empty = !data || (Array.isArray((data as { lines?: unknown[] }).lines)
    ? (data as { lines: unknown[] }).lines.length === 0
    : ((data as { days?: unknown[] }).days?.length ?? 0) === 0);

  function exportCsv() {
    if (!data) return;
    const rows = csvRows(report, data);
    if (rows.length === 0) return;
    // Point-virgule : séparateur attendu par un tableur en configuration
    // française, où la virgule est le séparateur décimal.
    const csv = rows.map((r: string[]) => r.map(csvCell).join(';')).join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rapport-${report}-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* -------------------------------------------------------------- rendu */

  return (
    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] md:h-full md:overflow-hidden">
      {/* Sous-navigation des rapports */}
      <aside className="border-r border-border bg-surface md:overflow-y-auto">
        <div className="px-5 py-4 border-b border-border">
          <div className="text-[10px] uppercase tracking-widest text-ink-soft font-semibold">Section</div>
          <div className="text-lg font-semibold tracking-tight">Rapports</div>
        </div>
        <nav className="p-2 space-y-0.5">
          {REPORTS.map((r) => {
            const active = r.key === report;
            return (
              <button
                key={r.key}
                onClick={() => setReport(r.key)}
                className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? 'bg-accent-soft text-accent-deep' : 'text-ink-soft hover:bg-gray-50 hover:text-ink'
                }`}
              >
                <span className="text-accent-deep"><Icon name={r.icon} size={20} /></span>
                <span className="truncate">{r.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="md:overflow-y-auto">
        <div className="p-6 md:p-8 space-y-5">
          {/* En-tête : titre + période, même structure que les autres pages. */}
          <PageHeader
            title={meta.label}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {stores.length > 1 && (
                  <StoreScopeSelect
                    stores={[{ id: '', name: 'Toutes les boutiques' }, ...stores]}
                    value={storeId}
                    onChange={setStoreId}
                    hideLabel
                  />
                )}
                <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 h-10">
                  <input type="date" value={from} max={to}
                         onChange={(e) => setFrom(e.target.value)}
                         className="bg-transparent text-sm outline-none" />
                  <span className="text-ink-soft text-sm">→</span>
                  <input type="date" value={to} min={from}
                         onChange={(e) => setTo(e.target.value)}
                         className="bg-transparent text-sm outline-none" />
                </div>
              </div>
            }
          />

          {/* Périodes courantes, en un clic. La période active se reconnaît à
              sa pastille pleine — utile après une saisie manuelle, où plus
              aucune ne correspond. */}
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const active = p.key === activePreset;
              return (
                <button
                  key={p.key}
                  onClick={() => applyPreset(p.key)}
                  aria-pressed={active}
                  className={`rounded-full border px-3.5 h-9 text-sm font-medium transition-colors ${
                    active
                      ? 'border-accent bg-accent-soft text-accent-deep'
                      : 'border-border bg-surface text-ink-soft hover:border-gray-300 hover:text-ink'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Rappel de ce que contient le rapport */}
          <div className="rounded-xl border border-border bg-accent-soft/60 px-4 py-3 flex gap-3">
            <span className="text-accent-deep shrink-0 mt-0.5"><Icon name="dashboard" size={18} /></span>
            <div>
              <div className="text-sm font-semibold">Rapport des {meta.label.toLowerCase()}</div>
              <p className="text-sm text-ink-soft mt-0.5 max-w-4xl">{meta.help}</p>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-end gap-2 mb-3">
              <button onClick={() => void load()} className="btn-ghost text-sm">Actualiser</button>
              <button onClick={exportCsv} className="btn-primary text-sm inline-flex items-center gap-2"
                      disabled={loading || empty}>
                <Icon name="exports" size={16} />
                Exporter
              </button>
            </div>

            {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
            {/* Tant que les données du rapport affiché ne sont pas là, on
                annonce le chargement : le changement d'onglet est instantané,
                la requête ne l'est pas. */}
            {!error && (loading || !data) && (
              <p className="py-10 text-center text-sm text-ink-soft">Chargement…</p>
            )}

            {!loading && !error && data && (
              <>
                {report === 'sales' && <SalesTable data={data as unknown as SalesData} />}
                {report === 'lines' && <LinesTable data={data as unknown as LinesData} />}
                {report === 'debts' && <DebtsTable data={data as unknown as DebtsData} />}
                {report === 'refunds' && <RefundsTable data={data as unknown as RefundsData} />}
                {report === 'cancellations' && <CancelTable data={data as unknown as CancelData} />}
                {report === 'vouchers' && <VouchersTable data={data as unknown as VouchersData} />}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------- tableaux */

function SalesTable({ data }: { data: SalesData }) {
  if (data.days.length === 0) {
    return <p className="py-10 text-center text-sm text-ink-soft">Aucune vente sur cette période.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-ink-soft">
            <Th sticky>Date</Th>
            <Th right>Tickets</Th>
            <Th right>Total HT</Th>
            <Th right>Total TVA</Th>
            <Th right>Total TTC</Th>
            {data.rates.map((r) => <Th key={r} right>TVA {r} %</Th>)}
            <Th right>Réductions</Th>
            <Th right>Marge brute</Th>
            {data.methods.map((m) => <Th key={m} right>{PAYMENT_LABELS[m] ?? m}</Th>)}
            <Th right>Avoirs</Th>
          </tr>
        </thead>
        <tbody>
          {data.days.map((d) => (
            <tr key={d.day} className="border-t border-border hover:bg-gray-50/60">
              <Td sticky>
                <span className="font-medium">{frDate(d.day)}</span>
              </Td>
              <Td right>{d.tickets}</Td>
              <Td right>{formatEUR(d.ht)}</Td>
              <Td right>{formatEUR(d.tva)}</Td>
              <Td right strong>{formatEUR(d.ttc)}</Td>
              {data.rates.map((r) => (
                <Td key={r} right>
                  <span className="block">{formatEUR(d.vat[r]?.tva ?? 0)}</span>
                  <span className="block text-[11px] text-ink-soft">
                    {formatEUR(d.vat[r]?.base_ht ?? 0)} HT
                  </span>
                </Td>
              ))}
              <Td right tone={d.discount > 0 ? 'warning' : undefined}>
                {d.discount > 0 ? `−${formatEUR(d.discount)}` : '—'}
              </Td>
              <Td right>{formatEUR(d.margin)}</Td>
              {data.methods.map((m) => (
                <Td key={m} right>{d.payments[m] ? formatEUR(d.payments[m]!) : '—'}</Td>
              ))}
              <Td right tone={d.credit_notes > 0 ? 'warning' : undefined}>
                {d.credit_notes > 0 ? `−${formatEUR(d.credit_notes)}` : '—'}
              </Td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink/20 font-semibold bg-gray-50">
            <Td sticky>Total</Td>
            <Td right>{data.totals.tickets}</Td>
            <Td right>{formatEUR(data.totals.ht)}</Td>
            <Td right>{formatEUR(data.totals.tva)}</Td>
            <Td right>{formatEUR(data.totals.ttc)}</Td>
            {data.rates.map((r) => (
              <Td key={r} right>{formatEUR(data.totals.vat[r]?.tva ?? 0)}</Td>
            ))}
            <Td right>{data.totals.discount > 0 ? `−${formatEUR(data.totals.discount)}` : '—'}</Td>
            <Td right>{formatEUR(data.totals.margin)}</Td>
            {data.methods.map((m) => (
              <Td key={m} right>{formatEUR(data.totals.payments[m] ?? 0)}</Td>
            ))}
            <Td right>
              {data.totals.credit_notes > 0 ? `−${formatEUR(data.totals.credit_notes)}` : '—'}
            </Td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function LinesTable({ data }: { data: LinesData }) {
  if (data.lines.length === 0) {
    return <p className="py-10 text-center text-sm text-ink-soft">Aucune vente sur cette période.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-ink-soft">
            <Th sticky>Article</Th>
            <Th>Catégorie</Th>
            <Th right>Quantité</Th>
            <Th right>Total HT</Th>
            <Th right>Total TVA</Th>
            <Th right>Total TTC</Th>
            <Th right>Réductions</Th>
            <Th right>Marge brute</Th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l, i) => (
            <tr key={`${l.label}-${i}`} className="border-t border-border hover:bg-gray-50/60">
              <Td sticky>
                <span className="block font-medium">{l.label}</span>
                {(l.sku || l.barcode) && (
                  <span className="block text-[11px] text-ink-soft">{l.sku ?? l.barcode}</span>
                )}
              </Td>
              <Td>{l.category ?? '—'}</Td>
              <Td right>{l.quantity}</Td>
              <Td right>{formatEUR(l.ht)}</Td>
              <Td right>{formatEUR(l.tva)}</Td>
              <Td right strong>{formatEUR(l.ttc)}</Td>
              <Td right tone={l.discount > 0 ? 'warning' : undefined}>
                {l.discount > 0 ? `−${formatEUR(l.discount)}` : '—'}
              </Td>
              <Td right>{l.margin == null ? '—' : formatEUR(l.margin)}</Td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink/20 font-semibold bg-gray-50">
            <Td sticky>Total</Td>
            <Td />
            <Td right>{data.totals.quantity}</Td>
            <Td right>{formatEUR(data.totals.ht)}</Td>
            <Td right>{formatEUR(data.totals.tva)}</Td>
            <Td right>{formatEUR(data.totals.ttc)}</Td>
            <Td right>{data.totals.discount > 0 ? `−${formatEUR(data.totals.discount)}` : '—'}</Td>
            <Td right>{formatEUR(data.totals.margin)}</Td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Rien à afficher : même message partout, pour ne pas surprendre. */
function Empty() {
  return <p className="py-10 text-center text-sm text-ink-soft">Rien à afficher sur cette période.</p>;
}

function DebtsTable({ data }: { data: DebtsData }) {
  if (data.lines.length === 0) return <Empty />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-ink-soft">
            <Th sticky>Date</Th><Th>Ticket</Th><Th>Vendeur</Th><Th>Client</Th><Th>Boutique</Th>
            <Th right>Total HT</Th><Th right>Total TTC</Th>
            <Th right>Mis en compte</Th><Th right>Solde client</Th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l) => (
            <tr key={l.sale_id} className="border-t border-border hover:bg-gray-50/60">
              <Td sticky>{frDateTime(l.date)}</Td>
              <Td>{l.receipt ?? '—'}</Td>
              <Td>{l.seller ?? '—'}</Td>
              <Td>{l.customer ?? <span className="text-ink-soft">Client anonyme</span>}</Td>
              <Td>{l.store ?? '—'}</Td>
              <Td right>{formatEUR(l.ht)}</Td>
              <Td right>{formatEUR(l.ttc)}</Td>
              <Td right strong>{formatEUR(l.deferred)}</Td>
              <Td right tone={(l.balance ?? 0) > 0 ? 'warning' : undefined}>
                {l.balance == null ? '—' : formatEUR(l.balance)}
              </Td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink/20 font-semibold bg-gray-50">
            <Td sticky>Total</Td><Td>{data.totals.count} ticket(s)</Td><Td /><Td /><Td />
            <Td right>{formatEUR(data.totals.ht)}</Td>
            <Td right>{formatEUR(data.totals.ttc)}</Td>
            <Td right>{formatEUR(data.totals.deferred)}</Td>
            <Td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function RefundsTable({ data }: { data: RefundsData }) {
  if (data.lines.length === 0) return <Empty />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-ink-soft">
            <Th sticky>Date</Th><Th>Avoir</Th><Th>Ticket</Th><Th>Vendeur</Th>
            <Th>Client</Th><Th>Boutique</Th><Th>Nature</Th><Th>Motif</Th><Th right>Montant</Th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l) => (
            <tr key={l.id} className="border-t border-border hover:bg-gray-50/60">
              <Td sticky>{frDateTime(l.date)}</Td>
              <Td>{l.number}</Td>
              <Td>{l.receipt ?? '—'}</Td>
              <Td>{l.seller ?? '—'}</Td>
              <Td>{l.customer ?? <span className="text-ink-soft">Client anonyme</span>}</Td>
              <Td>{l.store ?? '—'}</Td>
              <Td><Tag kind={l.kind} /></Td>
              <Td><span className="text-ink-soft">{l.reason}</span></Td>
              <Td right strong tone="warning">−{formatEUR(l.amount)}</Td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink/20 font-semibold bg-gray-50">
            <Td sticky>Total</Td>
            <Td>{data.totals.count}</Td><Td /><Td /><Td /><Td />
            <Td colSpan={2}>
              <span className="text-xs font-normal text-ink-soft">
                dont annulations {formatEUR(data.totals.cancellations)} · retours {formatEUR(data.totals.returns)}
              </span>
            </Td>
            <Td right>−{formatEUR(data.totals.amount)}</Td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function CancelTable({ data }: { data: CancelData }) {
  if (data.lines.length === 0) return <Empty />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-ink-soft">
            <Th sticky>Vente</Th><Th>Ticket</Th><Th>Annulée le</Th><Th>Vendeur</Th>
            <Th>Client</Th><Th>Boutique</Th><Th>Motif</Th>
            <Th right>Total HT</Th><Th right>Total TTC</Th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l) => (
            <tr key={l.id} className="border-t border-border hover:bg-gray-50/60">
              <Td sticky>{frDateTime(l.date)}</Td>
              <Td>{l.receipt ?? '—'}</Td>
              <Td>{l.cancelled_at ? frDateTime(l.cancelled_at) : '—'}</Td>
              <Td>{l.seller ?? '—'}</Td>
              <Td>{l.customer ?? <span className="text-ink-soft">Client anonyme</span>}</Td>
              <Td>{l.store ?? '—'}</Td>
              <Td><span className="text-ink-soft">{l.reason ?? '—'}</span></Td>
              <Td right>{formatEUR(l.ht)}</Td>
              <Td right strong tone="warning">{formatEUR(l.ttc)}</Td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink/20 font-semibold bg-gray-50">
            <Td sticky>Total</Td><Td>{data.totals.count} vente(s)</Td>
            <Td /><Td /><Td /><Td /><Td />
            <Td right>{formatEUR(data.totals.ht)}</Td>
            <Td right>{formatEUR(data.totals.ttc)}</Td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function VouchersTable({ data }: { data: VouchersData }) {
  if (data.lines.length === 0) return <Empty />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-ink-soft">
            <Th sticky>Date</Th><Th>Type</Th><Th>Référence</Th><Th>Client</Th>
            <Th right>Montant émis</Th><Th right>Restant</Th><Th>Expiration</Th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l) => (
            <tr key={`${l.type}-${l.id}`} className="border-t border-border hover:bg-gray-50/60">
              <Td sticky>{frDateTime(l.date)}</Td>
              <Td><Tag kind={l.type} /></Td>
              <Td><span className="font-mono text-xs">{l.reference}</span></Td>
              <Td>{l.customer ?? <span className="text-ink-soft">—</span>}</Td>
              <Td right>{formatEUR(l.amount)}</Td>
              <Td right strong tone={l.remaining > 0 ? 'warning' : undefined}>
                {formatEUR(l.remaining)}
              </Td>
              <Td>{l.expires_at ? frDate(l.expires_at.slice(0, 10)) : '—'}</Td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink/20 font-semibold bg-gray-50">
            <Td sticky>Total</Td><Td>{data.totals.count}</Td><Td /><Td />
            <Td right>{formatEUR(data.totals.amount)}</Td>
            <Td right>{formatEUR(data.totals.remaining)}</Td>
            <Td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Pastille de nature : la couleur porte le sens autant que le mot. */
function Tag({ kind }: { kind: 'cancellation' | 'return' | VoucherRow['type'] }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    cancellation: { label: 'Annulation', bg: 'rgba(180,35,24,0.10)', fg: '#B42318' },
    return: { label: 'Retour', bg: 'rgba(183,121,31,0.12)', fg: '#96581B' },
    credit_note: { label: VOUCHER_LABELS.credit_note, bg: 'rgba(183,121,31,0.12)', fg: '#96581B' },
    gift_card: { label: VOUCHER_LABELS.gift_card, bg: 'rgba(47,107,63,0.10)', fg: '#2F6B3F' },
    voucher: { label: VOUCHER_LABELS.voucher, bg: 'rgba(31,94,139,0.10)', fg: '#1F5E8B' },
  };
  const t = map[kind]!;
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: t.bg, color: t.fg }}>
      {t.label}
    </span>
  );
}

/* ------------------------------------------------------------- cellules */

function Th({ children, right, sticky }: {
  children?: React.ReactNode; right?: boolean; sticky?: boolean;
}) {
  return (
    <th className={`px-3 py-2.5 font-semibold whitespace-nowrap ${right ? 'text-right' : 'text-left'} ${
      sticky ? 'sticky left-0 bg-surface z-10' : ''
    }`}>
      {children}
    </th>
  );
}

function Td({ children, right, strong, sticky, tone, colSpan }: {
  children?: React.ReactNode; right?: boolean; strong?: boolean;
  sticky?: boolean; tone?: 'warning'; colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`px-3 py-2.5 whitespace-nowrap tabular-nums ${right ? 'text-right' : 'text-left'} ${
      strong ? 'font-semibold' : ''
    } ${tone === 'warning' ? 'text-warning' : ''} ${
      sticky ? 'sticky left-0 bg-inherit z-10 tabular-nums' : ''
    }`}>
      {children}
    </td>
  );
}

/* --------------------------------------------------------------- outils */

/** Date et heure locales, format court — les rapports listent des événements. */
function frDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function frDate(iso: string): string {
  try { return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR'); }
  catch { return iso; }
}

/** Nombre au format français, prêt pour un tableur. */
function n(v: number): string {
  return v.toFixed(2).replace('.', ',');
}

/** Lignes CSV du rapport affiché : entêtes puis données. */
function csvRows(report: Report, data: Record<string, unknown>): string[][] {
  const rows: string[][] = [];

  if (report === 'sales') {
    const d = data as unknown as SalesData;
    rows.push([
      'Date', 'Tickets', 'Total HT', 'Total TVA', 'Total TTC',
      ...d.rates.flatMap((r) => [`Base HT ${r}%`, `TVA ${r}%`]),
      'Réductions', 'Marge brute',
      ...d.methods.map((m) => PAYMENT_LABELS[m] ?? m),
      'Avoirs',
    ]);
    for (const x of d.days) {
      rows.push([
        x.day, String(x.tickets), n(x.ht), n(x.tva), n(x.ttc),
        ...d.rates.flatMap((r) => [n(x.vat[r]?.base_ht ?? 0), n(x.vat[r]?.tva ?? 0)]),
        n(x.discount), n(x.margin),
        ...d.methods.map((m) => n(x.payments[m] ?? 0)),
        n(x.credit_notes),
      ]);
    }
    return rows;
  }

  if (report === 'lines') {
    const d = data as unknown as LinesData;
    rows.push(['Article', 'Référence', 'Catégorie', 'Quantité', 'Total HT', 'Total TVA', 'Total TTC', 'Réductions', 'Marge brute']);
    for (const l of d.lines) {
      rows.push([
        l.label, l.sku ?? l.barcode ?? '', l.category ?? '', String(l.quantity),
        n(l.ht), n(l.tva), n(l.ttc), n(l.discount), l.margin == null ? '' : n(l.margin),
      ]);
    }
    return rows;
  }

  if (report === 'debts') {
    const d = data as unknown as DebtsData;
    rows.push(['Date', 'Ticket', 'Vendeur', 'Client', 'Boutique', 'Total HT', 'Total TTC', 'Mis en compte', 'Solde client']);
    for (const l of d.lines) {
      rows.push([
        frDateTime(l.date), l.receipt ?? '', l.seller ?? '', l.customer ?? '', l.store ?? '',
        n(l.ht), n(l.ttc), n(l.deferred), l.balance == null ? '' : n(l.balance),
      ]);
    }
    return rows;
  }

  if (report === 'refunds') {
    const d = data as unknown as RefundsData;
    rows.push(['Date', 'Avoir', 'Ticket', 'Vendeur', 'Client', 'Boutique', 'Nature', 'Motif', 'Montant']);
    for (const l of d.lines) {
      rows.push([
        frDateTime(l.date), l.number, l.receipt ?? '', l.seller ?? '', l.customer ?? '', l.store ?? '',
        l.kind === 'cancellation' ? 'Annulation' : 'Retour', l.reason, n(-l.amount),
      ]);
    }
    return rows;
  }

  if (report === 'cancellations') {
    const d = data as unknown as CancelData;
    rows.push(['Vente', 'Ticket', 'Annulée le', 'Vendeur', 'Client', 'Boutique', 'Motif', 'Total HT', 'Total TTC']);
    for (const l of d.lines) {
      rows.push([
        frDateTime(l.date), l.receipt ?? '', l.cancelled_at ? frDateTime(l.cancelled_at) : '',
        l.seller ?? '', l.customer ?? '', l.store ?? '', l.reason ?? '', n(l.ht), n(l.ttc),
      ]);
    }
    return rows;
  }

  const d = data as unknown as VouchersData;
  rows.push(['Date', 'Type', 'Référence', 'Client', 'Montant émis', 'Restant', 'Expiration']);
  for (const l of d.lines) {
    rows.push([
      frDateTime(l.date), VOUCHER_LABELS[l.type], l.reference, l.customer ?? '',
      n(l.amount), n(l.remaining), l.expires_at ? frDate(l.expires_at.slice(0, 10)) : '',
    ]);
  }
  return rows;
}

function csvCell(v: string): string {
  return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
