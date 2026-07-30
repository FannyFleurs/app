'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatEUR } from '@/lib/services/money';

type StockEntry = {
  id: string; kind: 'stock'; movement_type: string;
  quantity_delta: number; new_quantity: number;
  reason: string | null; created_at: string;
  store_name: string; user_name: string | null;
  receipt_number: string | null; sale_id: string | null;
  counterpart_store: string | null;
};
type PriceEntry = {
  id: string; kind: 'price';
  old_price_ttc: number | null; new_price_ttc: number;
  reason: string | null; created_at: string; user_name: string | null;
};
type Entry = StockEntry | PriceEntry;

const TYPE_META: Record<string, { label: string; tone: 'in' | 'out' | 'neutral' }> = {
  purchase:     { label: 'Entrée (achat)', tone: 'in' },
  return:       { label: 'Retour client', tone: 'in' },
  transfer_in:  { label: 'Transfert entrant', tone: 'in' },
  sale:         { label: 'Vente', tone: 'out' },
  loss:         { label: 'Perte / déstockage', tone: 'out' },
  transfer_out: { label: 'Transfert sortant', tone: 'out' },
  adjustment:   { label: 'Ajustement', tone: 'neutral' },
  inventory:    { label: 'Inventaire', tone: 'neutral' },
};

function fmtQty(n: number): string {
  const s = n.toLocaleString('fr-FR', { maximumFractionDigits: 3 });
  return n > 0 ? `+${s}` : s;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function ProductHistory({ productId }: { productId: string }) {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  // Ouvre une vente dans « Ma journée » (même si la date est lointaine) :
  // on force la date du jour de la vente et on présélectionne le ticket.
  function openSaleInDay(saleId: string, createdAtIso: string) {
    const day = createdAtIso.slice(0, 10); // YYYY-MM-DD
    router.push(`/ma-journee?date=${day}&sale=${saleId}`);
  }

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/products/${productId}/history`);
        if (r.ok) setEntries((await r.json()).entries);
      } finally { setLoading(false); }
    })();
  }, [productId]);

  // Texte recherchable par entrée (type, motif, ticket, boutique, date…).
  const searchable = useMemo(() => entries.map((e) => {
    const parts: (string | null)[] = [fmtDate(e.created_at)];
    if (e.kind === 'stock') {
      parts.push(TYPE_META[e.movement_type]?.label ?? e.movement_type);
      parts.push(e.reason, e.store_name, e.user_name, e.receipt_number, e.counterpart_store);
    } else {
      parts.push('changement de prix', e.reason, e.user_name);
    }
    return { e, text: parts.filter(Boolean).join(' ').toLowerCase() };
  }), [entries]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return entries;
    return searchable.filter((s) => s.text.includes(needle)).map((s) => s.e);
  }, [q, searchable, entries]);

  return (
    <div className="space-y-3">
      <input
        className="input"
        placeholder="Rechercher (date, ticket, motif, boutique, vente, transfert…)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {loading ? (
        <p className="text-sm text-ink-soft py-6 text-center">Chargement de l&apos;historique…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-ink-soft py-6 text-center">
          {entries.length === 0 ? 'Aucun mouvement pour cet article.' : 'Aucun résultat pour cette recherche.'}
        </p>
      ) : (
        <ul className="space-y-2 max-h-[55vh] overflow-y-auto pr-0.5">
          {filtered.map((e) => e.kind === 'stock'
            ? <StockRow key={e.id} e={e} onOpenSale={openSaleInDay} />
            : <PriceRow key={e.id} e={e} />)}
        </ul>
      )}
    </div>
  );
}

function Dot({ tone }: { tone: 'in' | 'out' | 'neutral' | 'price' }) {
  const cls = tone === 'in' ? 'bg-success' : tone === 'out' ? 'bg-danger'
    : tone === 'price' ? 'bg-accent' : 'bg-ink-soft';
  return <span className={`mt-1 inline-block h-2.5 w-2.5 rounded-full shrink-0 ${cls}`} />;
}

function StockRow({ e, onOpenSale }: { e: StockEntry; onOpenSale?: (saleId: string, createdAtIso: string) => void }) {
  const meta = TYPE_META[e.movement_type] ?? { label: e.movement_type, tone: 'neutral' as const };
  // Une entrée « vente » rattachée à un ticket est cliquable : elle ouvre la
  // vente dans « Ma journée » (à sa date, même lointaine).
  const clickable = !!e.sale_id && !!onOpenSale;
  const open = () => { if (clickable) onOpenSale!(e.sale_id!, e.created_at); };
  return (
    <li
      className={`rounded-xl border border-border p-3 ${clickable ? 'cursor-pointer hover:border-accent-deep hover:bg-accent-soft/40 transition-colors' : ''}`}
      onClick={clickable ? open : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } } : undefined}
      title={clickable ? 'Ouvrir cette vente dans Ma journée' : undefined}
    >
      <div className="flex items-start gap-2.5">
        <Dot tone={meta.tone} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium">
              {meta.label}
              {clickable && <span className="ml-1.5 text-xs text-accent-deep font-normal">· voir la vente →</span>}
            </span>
            <span className={`tabular-nums font-semibold whitespace-nowrap ${
              e.quantity_delta > 0 ? 'text-success' : e.quantity_delta < 0 ? 'text-danger' : ''
            }`}>
              {fmtQty(e.quantity_delta)}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-ink-soft flex flex-wrap gap-x-2 gap-y-0.5">
            <span>{fmtDate(e.created_at)}</span>
            <span>· {e.store_name}</span>
            <span>· stock : {e.new_quantity.toLocaleString('fr-FR', { maximumFractionDigits: 3 })}</span>
            {e.user_name && <span>· {e.user_name}</span>}
          </div>
          {/* Détails contextuels : ticket de vente, boutique de transfert, motif. */}
          <div className="mt-1 flex flex-wrap gap-1.5">
            {e.receipt_number && (
              <span className="inline-flex items-center gap-1 rounded-md bg-bg px-1.5 py-0.5 text-xs font-mono">
                🎫 {e.receipt_number}
              </span>
            )}
            {e.counterpart_store && (
              <span className="inline-flex items-center gap-1 rounded-md bg-bg px-1.5 py-0.5 text-xs">
                {e.movement_type === 'transfer_out' ? '→ vers' : '← depuis'} {e.counterpart_store}
              </span>
            )}
          </div>
          {e.reason && !e.receipt_number && (
            <div className="mt-1 text-xs text-ink-soft italic">{e.reason}</div>
          )}
        </div>
      </div>
    </li>
  );
}

function PriceRow({ e }: { e: PriceEntry }) {
  return (
    <li className="rounded-xl border border-border p-3">
      <div className="flex items-start gap-2.5">
        <Dot tone="price" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium">Changement de prix</span>
            <span className="tabular-nums font-semibold whitespace-nowrap">
              {e.old_price_ttc != null && (
                <span className="text-ink-soft line-through mr-1 font-normal">{formatEUR(e.old_price_ttc)}</span>
              )}
              {formatEUR(e.new_price_ttc)}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-ink-soft flex flex-wrap gap-x-2">
            <span>{fmtDate(e.created_at)}</span>
            {e.user_name && <span>· {e.user_name}</span>}
          </div>
          {e.reason && <div className="mt-1 text-xs text-ink-soft italic">{e.reason}</div>}
        </div>
      </div>
    </li>
  );
}
