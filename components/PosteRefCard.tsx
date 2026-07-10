'use client';

import { useEffect, useState } from 'react';
import { posteRef } from '@/lib/poste-ref';
import { readDeviceId } from '@/lib/device';

/**
 * Carte d'information affichée dans les paramètres : référence du poste
 * (caisse liée à CET appareil) + boutique/caisse. Remplace l'ancien badge
 * flottant en bas de la caisse (retiré pour ne pas gêner la vente,
 * notamment sur mobile). L'opérateur peut communiquer cette référence au
 * support (retrouvée dans l'admin > Postes actifs).
 */
export default function PosteRefCard() {
  const [ref, setRef] = useState<string | null>(null);
  const [store, setStore] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dev = readDeviceId();
    if (!dev) { setLoaded(true); return; }
    void (async () => {
      try {
        const r = await fetch(`/api/registers/mine?device_id=${encodeURIComponent(dev)}`);
        if (r.ok) {
          const j = await r.json();
          if (j.register) {
            setRef(posteRef(j.register.id));
            setStore(`${j.register.store_name} · ${j.register.name}`);
          }
        }
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  if (!loaded) return null;

  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-widest text-ink-soft font-semibold">
        Poste (cet appareil)
      </div>
      {ref ? (
        <div className="mt-1 flex items-baseline gap-2 flex-wrap">
          <span className="font-mono font-semibold text-lg">{ref}</span>
          {store && <span className="text-sm text-ink-soft">{store}</span>}
        </div>
      ) : (
        <div className="mt-1 text-sm text-ink-soft">
          Aucune caisse liée à cet appareil pour le moment.
        </div>
      )}
      <p className="mt-1 text-xs text-ink-soft">
        Référence à communiquer au support en cas de besoin.
      </p>
    </div>
  );
}
