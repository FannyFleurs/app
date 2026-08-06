'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import { PAYMENT_LABELS } from '@/components/labels';
import StoreScopeSelect from '@/components/StoreScopeSelect';
import Icon from '@/components/Icon';

/**
 * Rapports du back-office.
 *
 * Deux lectures d'une même période : le chiffre d'affaires jour par jour, et
 * le détail de ce qui s'est vendu. Les colonnes de TVA et de moyens de
 * paiement sont construites à partir des données réellement présentes sur la
 * période — une boutique qui ajoute un taux ou un mode de règlement le voit
 * apparaître sans intervention.
 */

type Report = 'sales' | 'lines';

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

const REPORTS: Array<{ key: Report; label: string; icon: 'dashboard' | 'products'; help: string }> = [
  {
    key: 'sales',
    label: 'Ventes',
    icon: 'dashboard',
    help: "Le chiffre d'affaires réalisé jour par jour sur la période choisie : ventilation de TVA, réductions, marge et encaissements par moyen de règlement.",
  },
  {
    key: 'lines',
    label: 'Lignes de vente',
    icon: 'products',
    help: "Ce qui s'est vendu sur la période, article par article : quantités, chiffre d'affaires et marge.",
  },
];

/** Date du jour et d'il y a 30 jours, au format attendu par les champs date. */
function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const past = new Date(today.getTime() - 29 * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(past), to: fmt(today) };
}

export default function ReportsClient({ stores }: { stores: { id: string; name: string }[] }) {
  const initial = useMemo(defaultRange, []);
  const [report, setReport] = useState<Report>('sales');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [storeId, setStoreId] = useState<string>('');
  const [sales, setSales] = useState<SalesData | null>(null);
  const [lines, setLines] = useState<LinesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const qs = new URLSearchParams({ from, to });
    if (storeId) qs.set('store_id', storeId);
    try {
      const path = report === 'sales' ? 'sales' : 'sale-lines';
      const r = await fetch(`/api/reports/${path}?${qs.toString()}`, { cache: 'no-store' });
      if (!r.ok) { setError('Chargement impossible.'); return; }
      const j = await r.json();
      if (report === 'sales') setSales(j as SalesData);
      else setLines(j as LinesData);
    } catch {
      setError('Réseau indisponible.');
    } finally {
      setLoading(false);
    }
  }, [report, from, to, storeId]);

  useEffect(() => { void load(); }, [load]);

  const meta = REPORTS.find((r) => r.key === report)!;

  /* ------------------------------------------------------------- export */

  function exportCsv() {
    const rows: string[][] = [];
    if (report === 'sales' && sales) {
      rows.push([
        'Date', 'Tickets', 'Total HT', 'Total TVA', 'Total TTC',
        ...sales.rates.flatMap((r) => [`Base HT ${r}%`, `TVA ${r}%`]),
        'Réductions', 'Marge brute',
        ...sales.methods.map((m) => PAYMENT_LABELS[m] ?? m),
        'Avoirs',
      ]);
      for (const d of sales.days) {
        rows.push([
          d.day, String(d.tickets), n(d.ht), n(d.tva), n(d.ttc),
          ...sales.rates.flatMap((r) => [n(d.vat[r]?.base_ht ?? 0), n(d.vat[r]?.tva ?? 0)]),
          n(d.discount), n(d.margin),
          ...sales.methods.map((m) => n(d.payments[m] ?? 0)),
          n(d.credit_notes),
        ]);
      }
    } else if (lines) {
      rows.push(['Article', 'Référence', 'Catégorie', 'Quantité', 'Total HT', 'Total TVA', 'Total TTC', 'Réductions', 'Marge brute']);
      for (const l of lines.lines) {
        rows.push([
          l.label, l.sku ?? l.barcode ?? '', l.category ?? '',
          String(l.quantity), n(l.ht), n(l.tva), n(l.ttc), n(l.discount),
          l.margin == null ? '' : n(l.margin),
        ]);
      }
    }
    // Point-virgule : séparateur attendu par un tableur en configuration
    // française, où la virgule est le séparateur décimal.
    const csv = rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
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
        <div className="p-4 md:p-6 space-y-4">
          {/* En-tête : titre + période */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{meta.label}</h1>
            <div className="flex flex-wrap items-center gap-2">
              {stores.length > 1 && (
                <StoreScopeSelect
                  stores={[{ id: '', name: 'Toutes les boutiques' }, ...stores]}
                  value={storeId}
                  onChange={setStoreId}
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
                      disabled={loading || (report === 'sales' ? !sales?.days.length : !lines?.lines.length)}>
                <Icon name="exports" size={16} />
                Exporter
              </button>
            </div>

            {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
            {loading && <p className="py-10 text-center text-sm text-ink-soft">Chargement…</p>}

            {!loading && !error && report === 'sales' && sales && (
              <SalesTable data={sales} />
            )}
            {!loading && !error && report === 'lines' && lines && (
              <LinesTable data={lines} />
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

function Td({ children, right, strong, sticky, tone }: {
  children?: React.ReactNode; right?: boolean; strong?: boolean;
  sticky?: boolean; tone?: 'warning';
}) {
  return (
    <td className={`px-3 py-2.5 whitespace-nowrap tabular-nums ${right ? 'text-right' : 'text-left'} ${
      strong ? 'font-semibold' : ''
    } ${tone === 'warning' ? 'text-warning' : ''} ${
      sticky ? 'sticky left-0 bg-inherit z-10 tabular-nums' : ''
    }`}>
      {children}
    </td>
  );
}

/* --------------------------------------------------------------- outils */

function frDate(iso: string): string {
  try { return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR'); }
  catch { return iso; }
}

/** Nombre au format français, prêt pour un tableur. */
function n(v: number): string {
  return v.toFixed(2).replace('.', ',');
}

function csvCell(v: string): string {
  return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
