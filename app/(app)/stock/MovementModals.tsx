'use client';

import { useEffect, useState } from 'react';

/**
 * Saisie d'un mouvement de stock : quantité, puis type et motif.
 *
 * Extrait de l'écran Stock pour être ouvert aussi depuis la fiche article —
 * on y connaît déjà le produit, seule l'étape « choisir un produit » n'a pas
 * lieu d'être. Deux copies du pavé numérique auraient divergé au premier
 * ajustement de règle métier.
 */

export interface ProductRow { id: string; name: string; sku: string | null; unit?: string }

export function QuantityKeypadModal({ product, onClose, onConfirm }: {
  product: ProductRow;
  onClose: () => void;
  onConfirm: (delta: number) => void;
}) {
  const [sign, setSign] = useState<'+' | '−'>('+');
  const [digits, setDigits] = useState('');

  const display = digits === '' ? '0' : digits;
  const value = Number(digits || '0');
  const delta = sign === '+' ? value : -value;

  function press(k: string) {
    setDigits((cur) => {
      if (k === 'C') return '';
      if (k === '⌫') return cur.slice(0, -1);
      if (k === '.') return cur.includes('.') ? cur : (cur === '' ? '0.' : cur + '.');
      return cur === '0' ? k : cur + k;
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key >= '0' && e.key <= '9') { press(e.key); e.preventDefault(); }
      else if (e.key === '.' || e.key === ',') { press('.'); e.preventDefault(); }
      else if (e.key === 'Backspace') { press('⌫'); e.preventDefault(); }
      else if (e.key === 'Escape') { onClose(); }
      else if (e.key === 'Enter' && value > 0) { onConfirm(delta); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [delta, value, onClose, onConfirm]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl lg:max-w-4xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-xs uppercase tracking-widest text-ink-soft font-semibold">Quantité</div>
            <div className="font-semibold text-base truncate max-w-[300px]">{product.name}</div>
          </div>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            onClick={() => setSign('+')}
            className={`rounded-xl py-3 text-xl font-semibold border ${
              sign === '+'
                ? 'border-transparent text-white'
                : 'bg-white border-border text-ink-soft hover:text-ink'
            }`}
            style={sign === '+' ? { backgroundColor: 'var(--success, #16a34a)' } : undefined}
          >+ Entrée</button>
          <button
            onClick={() => setSign('−')}
            className={`rounded-xl py-3 text-xl font-semibold border ${
              sign === '−'
                ? 'border-transparent text-white'
                : 'bg-white border-border text-ink-soft hover:text-ink'
            }`}
            style={sign === '−' ? { backgroundColor: 'var(--danger, #dc2626)' } : undefined}
          >− Sortie</button>
        </div>

        <div className="rounded-2xl border border-border p-4 bg-gray-50 flex items-baseline justify-between">
          <span className="text-sm text-ink-soft">Quantité</span>
          <span className={`text-4xl font-semibold tabular-nums ${sign === '+' ? 'text-success' : 'text-danger'}`}>
            {sign}{display}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {['7','8','9','4','5','6','1','2','3','.','0','⌫'].map((k) => (
            <button key={k} onClick={() => press(k)}
                    className="h-14 rounded-xl border border-border bg-white text-2xl font-medium hover:bg-gray-50 active:scale-95">
              {k}
            </button>
          ))}
        </div>

        <button
          onClick={() => onConfirm(delta)}
          disabled={value <= 0}
          className="btn-primary w-full mt-4 h-12 text-base"
        >
          Valider la quantité
        </button>
      </div>
    </div>
  );
}

export function TypeAndReasonModal({ product, delta, storeId, onClose, onSaved }: {
  product: ProductRow;
  delta: number;
  storeId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isIn = delta > 0;
  // Types disponibles selon le sens du delta
  const types = isIn
    ? [
        { key: 'purchase',   label: 'Entrée fournisseur' },
        { key: 'adjustment', label: 'Ajustement (+)' },
        { key: 'inventory',  label: 'Inventaire' },
        { key: 'return',     label: 'Retour client' },
      ] as const
    : [
        { key: 'loss',       label: 'Perte / casse' },
        { key: 'adjustment', label: 'Ajustement (−)' },
        { key: 'inventory',  label: 'Inventaire' },
      ] as const;

  const [type, setType] = useState<typeof types[number]['key']>(types[0].key);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Motif obligatoire seulement pour les sorties (delta négatif).
  const reasonRequired = delta < 0;

  async function submit() {
    if (reasonRequired && !reason.trim()) {
      setError('Un motif est requis pour une sortie.'); return;
    }
    setSaving(true); setError(null);
    const finalReason = reason.trim()
      || (isIn ? 'Entrée stock' : 'Sortie stock');
    const r = await fetch('/api/stock/movement', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_id: storeId,
        product_id: product.id,
        movement_type: type,
        quantity_delta: delta,
        reason: finalReason,
      }),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl lg:max-w-4xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-ink-soft font-semibold">Mouvement</div>
            <div className="font-semibold text-base truncate max-w-[280px]">{product.name}</div>
            <div className={`text-2xl font-semibold mt-1 ${isIn ? 'text-success' : 'text-danger'}`}>
              {isIn ? '+' : ''}{delta}
            </div>
          </div>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>

        <label className="text-sm font-medium text-ink-soft">Type de mouvement</label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {types.map((t) => (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className={`rounded-xl border py-3 text-sm font-medium transition-colors ${
                type === t.key
                  ? 'accent-bar text-white border-transparent'
                  : 'bg-white border-border text-ink hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <label className="block mt-4 text-sm font-medium text-ink-soft">
          Motif {reasonRequired
            ? <span className="text-danger">*</span>
            : <span className="text-ink-soft/60">(optionnel pour entrée)</span>}
        </label>
        <input
          className="input mt-1"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={reasonRequired
            ? 'ex : casse, fleurs fanées, écart inventaire'
            : 'ex : Livraison Aoki Fleurs'}
        />

        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1">‹ Retour</button>
          <button onClick={() => void submit()} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
