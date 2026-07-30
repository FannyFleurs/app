'use client';

import { useState } from 'react';
import { formatEUR } from '@/lib/services/money';

interface Props {
  cartTotal: number;
  currentComment: string;
  /** Restreint le panneau à une seule action (« Remise » ou « Commentaire ») :
   *  les onglets sont masqués. */
  only?: 'discount' | 'comment';
  onClose: () => void;
  onCartDiscount: (mode: 'percent' | 'amount', value: number) => void;
  onCommentSave: (comment: string) => void;
}

export default function CartActionsModal({
  cartTotal, currentComment, only, onClose, onCartDiscount, onCommentSave,
}: Props) {
  const [tab, setTab] = useState<'discount' | 'comment'>(only ?? 'discount');
  const [mode, setMode] = useState<'percent' | 'amount'>('percent');
  const [percent, setPercent] = useState<number>(0);
  const [amount, setAmount] = useState<number>(0);
  const [comment, setComment] = useState(currentComment);

  const computed = mode === 'percent'
    ? Math.round((cartTotal * percent / 100) * 100) / 100
    : Math.min(amount, cartTotal);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">
            {only === 'comment' ? 'Commentaire' : only === 'discount' ? 'Remise' : 'Actions panier'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="h-10 w-10 grid place-items-center rounded-lg text-lg text-ink-soft hover:bg-gray-100 hover:text-ink"
          >✕</button>
        </div>

        <div className={`flex gap-1 border-b border-border mb-3 ${only ? 'hidden' : ''}`}>
          <button onClick={() => setTab('discount')}
                  className={`px-4 h-12 text-base font-medium border-b-2 -mb-px ${
                    tab === 'discount' ? 'border-sage text-accent-deep' : 'border-transparent text-ink-soft'
                  }`}>
            Remise globale
          </button>
          <button onClick={() => setTab('comment')}
                  className={`px-4 h-12 text-base font-medium border-b-2 -mb-px ${
                    tab === 'comment' ? 'border-sage text-accent-deep' : 'border-transparent text-ink-soft'
                  }`}>
            Commentaire
          </button>
        </div>

        {tab === 'discount' ? (
          <>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setMode('percent')}
                      className={`flex-1 rounded-xl h-12 text-base font-semibold border ${
                        mode === 'percent' ? 'accent-bar text-white border-transparent' : 'bg-white border-border'
                      }`}>Pourcentage</button>
              <button onClick={() => setMode('amount')}
                      className={`flex-1 rounded-xl h-12 text-base font-semibold border ${
                        mode === 'amount' ? 'accent-bar text-white border-transparent' : 'bg-white border-border'
                      }`}>Montant €</button>
            </div>

            {mode === 'percent' ? (
              <div>
                <label className="text-xs font-medium text-ink-soft">Pourcentage</label>
                <input
                  type="number" step="0.5" min={0} max={100}
                  className="input mt-1 h-14 text-2xl font-semibold"
                  value={percent || ''}
                  onChange={(e) => setPercent(Number(e.target.value) || 0)}
                  autoFocus
                />
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-ink-soft">Montant (€)</label>
                <input
                  type="number" step="0.01" min={0} max={cartTotal}
                  className="input mt-1 h-14 text-2xl font-semibold"
                  value={amount || ''}
                  onChange={(e) => setAmount(Number(e.target.value) || 0)}
                  autoFocus
                />
              </div>
            )}

            <div className="mt-3 rounded-xl bg-gray-50 p-3 flex items-baseline justify-between text-sm">
              <span>Remise calculée</span>
              <span className="text-xl font-semibold text-warning">-{formatEUR(computed)}</span>
            </div>

            <button
              onClick={() => onCartDiscount(mode, mode === 'percent' ? percent : amount)}
              disabled={computed <= 0}
              className="btn-primary w-full mt-4 h-14 text-base font-semibold"
            >
              Appliquer la remise au panier
            </button>
          </>
        ) : (
          <>
            <label className="text-sm font-medium text-ink-soft">Commentaire pour ce ticket</label>
            <textarea
              autoFocus
              className="input mt-1 h-28 text-base py-2"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="ex : pour Madame Dupont, livraison samedi"
            />
            <button
              onClick={() => onCommentSave(comment.trim())}
              className="btn-primary w-full mt-4 h-14 text-base font-semibold"
            >
              Enregistrer le commentaire
            </button>
          </>
        )}
      </div>
    </div>
  );
}
