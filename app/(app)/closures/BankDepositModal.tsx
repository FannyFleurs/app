'use client';

import { useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import { DEFAULT_DEPOSIT_REASON, ensureDepositReason } from '@/lib/services/cash-deposit';

interface Props {
  registerId: string;
  maxAmount?: number;
  onClose: () => void;
  onSaved: () => void;
}

export default function BankDepositModal({ registerId, maxAmount, onClose, onSaved }: Props) {
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState(DEFAULT_DEPOSIT_REASON);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printReceipt, setPrintReceipt] = useState(true);

  async function submit() {
    if (amount <= 0) { setError('Montant invalide.'); return; }
    setLoading(true); setError(null);
    // Garantit un mot-clé reconnu dans le motif pour que le prélèvement soit
    // défalqué dans la clôture / le Z.
    const finalReason = ensureDepositReason(reason);
    const res = await fetch('/api/cash-sessions/cash-movement', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        register_id: registerId,
        movement_type: 'out',
        amount,
        reason: finalReason,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? 'Erreur');
      return;
    }
    const j = await res.json();
    if (printReceipt && j.id) {
      window.open(`/api/cash-sessions/cash-movement/${j.id}/receipt-pdf`, '_blank');
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4">
      <div className="card w-full max-w-2xl lg:max-w-4xl p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Prélèvement</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>

        <p className="mt-2 text-sm text-ink-soft">
          Sortie d&apos;espèces du tiroir-caisse (dépôt en banque, retrait…).
          L&apos;opération est tracée dans le journal des mouvements et déduite des
          espèces attendues.
        </p>

        <label className="block mt-4 text-sm font-medium text-ink-soft">Montant (€)</label>
        <input
          type="number" step="0.01" min={0}
          className="input mt-1 text-2xl font-semibold"
          value={amount || ''}
          onChange={(e) => setAmount(Number(e.target.value) || 0)}
          placeholder="0,00"
          autoFocus
        />
        {maxAmount && maxAmount > 0 && (
          <p className="mt-1 text-xs text-ink-soft">
            Espèces attendues actuellement : {formatEUR(maxAmount)}
          </p>
        )}

        <label className="block mt-3 text-sm font-medium text-ink-soft">Motif / référence</label>
        <input
          className="input mt-1"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Prélèvement · numéro de bordereau"
        />

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={printReceipt}
                 onChange={(e) => setPrintReceipt(e.target.checked)} />
          Imprimer le reçu (date, vendeur, montant)
        </label>

        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <button disabled={loading || amount <= 0} onClick={() => void submit()} className="btn-primary w-full mt-4 h-11">
          {loading ? 'Enregistrement…' : `Sortir ${formatEUR(amount)} de la caisse`}
        </button>
      </div>
    </div>
  );
}
