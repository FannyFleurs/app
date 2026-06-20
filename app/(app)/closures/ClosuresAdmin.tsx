'use client';

import { useEffect, useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';

interface Closure {
  id: string;
  business_date: string;
  total_sales: number; total_ttc: string; total_ht: string; total_tva: string;
  cash_expected: string; cash_counted: string | null; cash_variance: string | null;
  sealed_at: string; fiscal_hash: string;
}

export default function ClosuresAdmin({ stores }: { stores: { id: string; name: string }[] }) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? '');
  const [items, setItems] = useState<Closure[]>([]);
  const [today, setToday] = useState(new Date().toISOString().slice(0, 10));
  const [cash, setCash] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sealing, setSealing] = useState(false);

  async function reload() {
    if (!storeId) return;
    const r = await fetch(`/api/closures/daily?store_id=${storeId}`);
    if (r.ok) setItems((await r.json()).closures);
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [storeId]);

  async function seal() {
    setSealing(true); setError(null); setInfo(null);
    const body: Record<string, unknown> = { store_id: storeId, business_date: today };
    if (cash) body.counted_cash = Number(cash);
    const r = await fetch('/api/closures/daily', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSealing(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? 'Erreur');
      return;
    }
    const j = await r.json();
    setInfo(`Clôture scellée. Empreinte ${j.fiscal_hash.slice(0,16)}…`);
    setCash('');
    await reload();
  }

  if (!stores.length) {
    return (
      <div className="p-8">
        <EmptyState icon="◐" title="Aucune boutique configurée" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-5">
      <PageHeader
        title="Clôtures de caisse"
        subtitle="Scellement journalier inaltérable : consolidation TVA, paiements, espèces, hash chaîné dans le journal fiscal."
      />

      <section className="card p-5">
        <h2 className="font-semibold">Nouvelle clôture journalière</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Le scellement écrit un événement fiscal immuable dans la chaîne. Aucune correction directe possible
          ensuite — toute rectification passera par une écriture corrective datée.
        </p>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-ink-soft">Boutique</label>
            <select className="input mt-1" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-soft">Date d&apos;opération</label>
            <input type="date" className="input mt-1" value={today} onChange={(e) => setToday(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-soft">Espèces comptées (€)</label>
            <input
              type="number" step="0.01" className="input mt-1"
              value={cash} onChange={(e) => setCash(e.target.value)}
              placeholder="optionnel"
            />
          </div>
          <button disabled={sealing} onClick={() => void seal()} className="btn-primary h-11">
            {sealing ? 'Scellement…' : '🔒 Sceller la journée'}
          </button>
        </div>
        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        {info && <div className="mt-3 rounded-xl bg-success/10 px-3 py-2 text-sm text-success">{info}</div>}
      </section>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft mb-2">
          Historique ({items.length})
        </h2>
        {items.length === 0 ? (
          <EmptyState icon="◐" title="Aucune clôture scellée" description="Procédez à votre première clôture ci-dessus." />
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg text-ink-soft text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-right px-4 py-3">Tickets</th>
                  <th className="text-right px-4 py-3">CA TTC</th>
                  <th className="text-right px-4 py-3">TVA</th>
                  <th className="text-right px-4 py-3">Espèces attendues</th>
                  <th className="text-right px-4 py-3">Comptées</th>
                  <th className="text-right px-4 py-3">Écart</th>
                  <th className="text-left px-4 py-3">Empreinte</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{c.business_date}</td>
                    <td className="px-4 py-3 text-right">{c.total_sales}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatEUR(Number(c.total_ttc))}</td>
                    <td className="px-4 py-3 text-right">{formatEUR(Number(c.total_tva))}</td>
                    <td className="px-4 py-3 text-right">{formatEUR(Number(c.cash_expected))}</td>
                    <td className="px-4 py-3 text-right">
                      {c.cash_counted == null ? '—' : formatEUR(Number(c.cash_counted))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.cash_variance == null ? <span className="text-ink-soft">—</span> :
                       Number(c.cash_variance) === 0 ? <Badge tone="success">0,00 €</Badge> :
                       <Badge tone="warning">{formatEUR(Number(c.cash_variance))}</Badge>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-soft">{c.fiscal_hash.slice(0,16)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
