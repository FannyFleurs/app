'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatEUR } from '@/lib/services/money';

type GiftCard = {
  id: string; code: string; balance: string; initial_amount: string;
  status: string; kind: string; expires_at: string | null;
};

/**
 * Panneau d'administration fidélité d'une fiche client :
 *   - régularisation manuelle du solde fidélité (+/-, en euros) ;
 *   - ajout manuel d'une carte cadeau ou d'un bon d'achat rattaché au client
 *     (reprise de l'existant : code libre possible).
 *
 * Autonome : charge lui-même le solde et les cartes via /balances, et se
 * rafraîchit après chaque opération. Utilisable aussi bien dans la fiche
 * complète (/customers/[id]) que dans le panneau latéral de la liste clients.
 *
 * Le solde fidélité est exprimé en euros (1 « point » applicatif = 1 €).
 */
export default function LoyaltyPanel({
  customerId, onChanged,
}: {
  customerId: string;
  /** Appelé après une modification (pour rafraîchir la vue parente). */
  onChanged?: () => void;
}) {
  const [balance, setBalance] = useState<number | null>(null);
  const [giftCards, setGiftCards] = useState<GiftCard[]>([]);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/customers/${customerId}/balances`);
      if (!res.ok) return;
      const j = await res.json();
      setBalance(Number(j.loyalty_balance) || 0);
      setGiftCards(Array.isArray(j.gift_cards) ? j.gift_cards : []);
    } catch { /* ignore */ }
  }, [customerId]);

  useEffect(() => { void reload(); }, [reload]);

  // — Régularisation —
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [adjBusy, setAdjBusy] = useState(false);
  const [adjErr, setAdjErr] = useState<string | null>(null);

  async function adjust(sign: 1 | -1) {
    const v = Number(amount.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) { setAdjErr('Saisis un montant positif.'); return; }
    setAdjBusy(true); setAdjErr(null);
    try {
      const res = await fetch(`/api/customers/${customerId}/loyalty/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_euros: sign * v, reason: reason || undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || 'Échec de la régularisation.');
      }
      setAmount(''); setReason('');
      await reload();
      onChanged?.();
    } catch (e) {
      setAdjErr((e as Error).message);
    } finally {
      setAdjBusy(false);
    }
  }

  // — Carte cadeau / bon d'achat —
  const [gcOpen, setGcOpen] = useState(false);
  const [gcKind, setGcKind] = useState<'gift_card' | 'voucher'>('voucher');
  const [gcAmount, setGcAmount] = useState('5');
  const [gcCode, setGcCode] = useState('');
  const [gcExpiry, setGcExpiry] = useState('');
  const [gcBusy, setGcBusy] = useState(false);
  const [gcErr, setGcErr] = useState<string | null>(null);

  async function addCard() {
    const v = Number(gcAmount.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) { setGcErr('Montant invalide.'); return; }
    setGcBusy(true); setGcErr(null);
    try {
      const res = await fetch('/api/gift-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: v,
          kind: gcKind,
          code: gcCode.trim() || undefined,
          expires_at: gcExpiry ? new Date(gcExpiry).toISOString() : undefined,
          buyer_id: customerId,
          beneficiary_id: customerId,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || 'Échec de la création.');
      }
      setGcOpen(false); setGcCode(''); setGcAmount('5'); setGcExpiry('');
      await reload();
      onChanged?.();
    } catch (e) {
      setGcErr((e as Error).message);
    } finally {
      setGcBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Solde + régularisation */}
      <div className="card p-5 space-y-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-ink-soft">Solde fidélité</div>
          <div className="text-3xl font-semibold tracking-tight">
            {balance != null ? formatEUR(balance) : '—'}
          </div>
        </div>

        <div className="border-t border-border pt-4 space-y-3">
          <div className="text-sm font-medium">Régulariser le solde</div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-32">
              <label className="text-xs text-ink-soft">Montant (€)</label>
              <input
                className="input h-10 w-full text-right tabular-nums"
                inputMode="decimal" placeholder="0,00"
                value={amount} onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-[10rem]">
              <label className="text-xs text-ink-soft">Motif (facultatif)</label>
              <input
                className="input h-10 w-full"
                placeholder="Ex. reprise ancien logiciel"
                value={reason} onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <button
              className="btn-soft h-10 px-4 text-success font-medium"
              disabled={adjBusy} onClick={() => void adjust(1)}
            >+ Ajouter</button>
            <button
              className="btn-soft h-10 px-4 text-danger font-medium"
              disabled={adjBusy} onClick={() => void adjust(-1)}
            >− Retirer</button>
          </div>
          {adjErr && <p className="text-xs text-danger">{adjErr}</p>}
        </div>
      </div>

      {/* Cartes cadeaux & bons d'achat rattachés */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Cartes cadeaux & bons d'achat</div>
          <button className="btn-soft h-9 px-3 text-sm" onClick={() => { setGcOpen((o) => !o); setGcErr(null); }}>
            {gcOpen ? 'Annuler' : 'Ajouter'}
          </button>
        </div>

        {gcOpen && (
          <div className="rounded-lg border border-border p-3 space-y-3 bg-bg">
            <div className="flex flex-wrap gap-2">
              <div>
                <label className="text-xs text-ink-soft">Type</label>
                <select
                  className="input h-10" value={gcKind}
                  onChange={(e) => setGcKind(e.target.value as 'gift_card' | 'voucher')}
                >
                  <option value="voucher">Bon d'achat</option>
                  <option value="gift_card">Carte cadeau</option>
                </select>
              </div>
              <div className="w-28">
                <label className="text-xs text-ink-soft">Montant (€)</label>
                <input
                  className="input h-10 w-full text-right tabular-nums"
                  inputMode="decimal" value={gcAmount}
                  onChange={(e) => setGcAmount(e.target.value)}
                />
              </div>
              <div className="flex-1 min-w-[10rem]">
                <label className="text-xs text-ink-soft">Code existant (facultatif)</label>
                <input
                  className="input h-10 w-full font-mono"
                  placeholder="Généré si vide"
                  value={gcCode} onChange={(e) => setGcCode(e.target.value)}
                />
              </div>
              <div className="w-40">
                <label className="text-xs text-ink-soft">Expire le (facultatif)</label>
                <input
                  type="date" className="input h-10 w-full"
                  value={gcExpiry} onChange={(e) => setGcExpiry(e.target.value)}
                />
              </div>
            </div>
            {gcErr && <p className="text-xs text-danger">{gcErr}</p>}
            <div className="flex justify-end">
              <button className="btn-primary h-10 px-4" disabled={gcBusy} onClick={() => void addCard()}>
                {gcBusy ? 'Création…' : 'Créer'}
              </button>
            </div>
          </div>
        )}

        {giftCards.length === 0 ? (
          <p className="text-sm text-ink-soft">Aucune carte cadeau ni bon d'achat rattaché.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-ink-soft text-xs uppercase">
              <tr>
                <th className="text-left py-2">Type</th>
                <th className="text-left py-2">Code</th>
                <th className="text-right py-2">Solde</th>
                <th className="text-left py-2 pl-4">Validité</th>
              </tr>
            </thead>
            <tbody>
              {giftCards.map((gc) => (
                <tr key={gc.id} className="border-t border-border">
                  <td className="py-2">{gc.kind === 'voucher' ? "Bon d'achat" : 'Carte cadeau'}</td>
                  <td className="py-2 font-mono text-xs">{gc.code}</td>
                  <td className="py-2 text-right tabular-nums">{formatEUR(Number(gc.balance))}</td>
                  <td className="py-2 pl-4 text-ink-soft text-xs">
                    {gc.expires_at ? new Date(gc.expires_at).toLocaleDateString('fr-FR') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
