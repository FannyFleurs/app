'use client';

import { useState } from 'react';
import { QuantityKeypadModal, TypeAndReasonModal } from '../stock/MovementModals';

interface Store { id: string; name: string }

/**
 * Onglet « Mouvement de stock » de la fiche article.
 *
 * Même saisie que Stock → « Faire un mouvement », à une étape près : le
 * produit est déjà connu, on ne le choisit pas. Corriger une quantité depuis
 * la fiche qu'on a sous les yeux évite l'aller-retour par la liste des
 * articles, où l'on risque de désigner un homonyme.
 */
export default function ProductMovement({ productId, productName, sku, storeId, stores }: {
  productId: string;
  productName: string;
  sku: string | null;
  /** Boutique imposée (poste de caisse). Sinon on la choisit dans `stores`. */
  storeId?: string;
  stores: Store[];
}) {
  // Mono-boutique : rien à choisir, on la prend d'office.
  const [selectedStore, setSelectedStore] = useState(
    storeId ?? (stores.length === 1 ? stores[0]!.id : ''),
  );
  const [step, setStep] = useState<'idle' | 'qty' | 'type'>('idle');
  const [delta, setDelta] = useState(0);
  const [done, setDone] = useState<string | null>(null);

  const product = { id: productId, name: productName, sku };

  return (
    <div className="py-2 space-y-4">
      {!storeId && stores.length > 1 && (
        <label className="block text-sm">
          <span className="text-ink-soft">Boutique</span>
          <select className="input mt-1" value={selectedStore}
                  onChange={(e) => setSelectedStore(e.target.value)}>
            <option value="">Choisissez une boutique…</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}

      {done && (
        <div className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">{done}</div>
      )}

      <button
        className="btn-primary w-full h-12 text-base"
        disabled={!selectedStore}
        onClick={() => { setDone(null); setStep('qty'); }}
      >
        + / − Saisir un mouvement
      </button>
      {!selectedStore && (
        <p className="text-sm text-ink-soft">
          Choisissez d&apos;abord la boutique concernée : un mouvement s&apos;applique à un
          stock, et le stock est tenu par boutique.
        </p>
      )}

      {step === 'qty' && (
        <QuantityKeypadModal
          product={product}
          onClose={() => setStep('idle')}
          onConfirm={(d) => { setDelta(d); setStep('type'); }}
        />
      )}
      {step === 'type' && (
        <TypeAndReasonModal
          product={product}
          delta={delta}
          storeId={selectedStore}
          onClose={() => setStep('qty')}
          onSaved={() => {
            setStep('idle');
            setDone(`✓ Mouvement enregistré : ${delta > 0 ? '+' : ''}${delta}`);
          }}
        />
      )}
    </div>
  );
}
