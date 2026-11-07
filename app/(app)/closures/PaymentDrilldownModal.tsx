'use client';

import { useEffect, useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import { PAYMENT_LABELS } from '@/components/labels';

interface PaymentDetail {
  id: string;
  kind: 'sale' | 'settlement';
  amount: number;
  created_at: string;
  receipt_number: string | null;
  customer_name: string | null;
  cashier_name: string | null;
  register_name: string | null;
  reference: string | null;
  label: string | null;
}

/**
 * Détail des paiements d'un mode de règlement, pour pointer 1 à 1 les
 * tickets en cas d'écart de caisse (ex. CB). Ne change RIEN à la
 * réconciliation existante (saisie réelle / montant conforme) : c'est un
 * aide-mémoire en lecture seule, avec une case à cocher par ligne.
 *
 * Le pointage est volontairement NON persisté en base (même principe que la
 * sélection de lignes dans ProductsList/StockAdmin) : il sert à la vérif en
 * cours, pas à un suivi dans le temps. Conservé par le parent (ClosuresAdmin)
 * tant que la modale reste montée/remontée, perdu au rechargement de la page.
 */
export default function PaymentDrilldownModal({
  storeId, date, method, methodTotal, methodCount, ticked, onToggleTicked, onClose,
}: {
  storeId: string;
  date: string;
  method: string;
  methodTotal: number;
  methodCount: number;
  ticked: Set<string>;
  onToggleTicked: (id: string) => void;
  onClose: () => void;
}) {
  const [payments, setPayments] = useState<PaymentDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPayments(null); setError(null);
    void (async () => {
      const r = await fetch(
        `/api/closures/daily/payments?store_id=${encodeURIComponent(storeId)}&date=${encodeURIComponent(date)}&method=${encodeURIComponent(method)}`,
      );
      if (cancelled) return;
      if (!r.ok) { setError('Impossible de charger le détail.'); return; }
      const j = await r.json();
      setPayments(j.payments as PaymentDetail[]);
    })();
    return () => { cancelled = true; };
  }, [storeId, date, method]);

  const tickedCount = payments?.filter((p) => ticked.has(p.id)).length ?? 0;
  const tickedTotal = payments?.filter((p) => ticked.has(p.id)).reduce((s, p) => s + p.amount, 0) ?? 0;
  const allTicked = payments !== null && payments.length > 0 && tickedCount === payments.length;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl lg:max-w-3xl p-6 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-semibold">{PAYMENT_LABELS[method] ?? method} — détail</h2>
            <p className="mt-0.5 text-sm text-ink-soft">
              Pointez chaque ticket en le comparant au relevé du terminal, pour repérer où est l&apos;écart.
            </p>
          </div>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm rounded-xl border border-border bg-gray-50 px-3 py-2 shrink-0">
          <span>
            <span className="text-ink-soft">Système : </span>
            <span className="font-medium">{formatEUR(methodTotal)}</span>
            <span className="text-ink-soft"> ({methodCount})</span>
          </span>
          <span>
            <span className="text-ink-soft">Pointé : </span>
            <span className={`font-medium ${allTicked && Math.abs(tickedTotal - methodTotal) < 0.005 ? 'text-success' : ''}`}>
              {formatEUR(tickedTotal)}
            </span>
            <span className="text-ink-soft"> ({tickedCount}/{methodCount})</span>
          </span>
          {allTicked && (
            <span className={Math.abs(tickedTotal - methodTotal) < 0.005 ? 'text-success font-medium' : 'text-danger font-medium'}>
              {Math.abs(tickedTotal - methodTotal) < 0.005
                ? '✓ Tout pointé, montant conforme'
                : `⚠ Tout pointé mais écart de ${formatEUR(tickedTotal - methodTotal)}`}
            </span>
          )}
        </div>

        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger shrink-0">{error}</div>}

        <div className="mt-3 flex-1 min-h-0 overflow-y-auto -mx-2 px-2">
          {payments === null ? (
            <p className="text-sm text-ink-soft py-6 text-center">Chargement…</p>
          ) : payments.length === 0 ? (
            <p className="text-sm text-ink-soft py-6 text-center">Aucun paiement pour ce mode.</p>
          ) : (
            <ul className="divide-y divide-border">
              {payments.map((p) => {
                const isTicked = ticked.has(p.id);
                const time = new Date(p.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                const main = p.kind === 'sale'
                  ? `Ticket ${p.receipt_number ?? '—'}`
                  : `Règlement solde — ${p.customer_name ?? 'Client'}`;
                const sub = [p.cashier_name, p.register_name, p.kind === 'settlement' ? p.reference : null]
                  .filter(Boolean).join(' · ');
                return (
                  <li key={p.id}>
                    <label className={`flex items-center gap-3 py-2.5 cursor-pointer ${isTicked ? 'opacity-50' : ''}`}>
                      <input
                        type="checkbox"
                        checked={isTicked}
                        onChange={() => onToggleTicked(p.id)}
                        className="h-5 w-5 shrink-0"
                      />
                      <span className="w-12 shrink-0 text-xs text-ink-soft tabular-nums">{time}</span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm font-medium truncate ${isTicked ? 'line-through' : ''}`}>{main}</span>
                        {sub && <span className="block text-xs text-ink-soft truncate">{sub}</span>}
                      </span>
                      <span className="shrink-0 text-sm font-medium tabular-nums">{formatEUR(p.amount)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
