'use client';

import { useEffect, useState } from 'react';
import AtelierScreen from './AtelierScreen';
import { readScreenStoreId, writeScreenStoreId, clearScreenStoreId } from '@/lib/screen-store';

interface Store { id: string; name: string }

/**
 * Écran atelier autonome (sous-domaine ecran.).
 *
 * Deux temps : on rattache l'écran à une boutique la première fois, puis il
 * l'oublie plus. C'est un écran mural que personne ne configure au quotidien ;
 * lui redemander sa boutique à chaque allumage reviendrait à lui demander de
 * choisir alors qu'il n'y a rien à décider.
 */
export default function EcranApp({ stores }: { stores: Store[] }) {
  // `undefined` = on n'a pas encore lu le stockage (rendu serveur) ; le
  // distinguer de `null` évite de faire clignoter le sélecteur au chargement.
  const [storeId, setStoreId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const saved = readScreenStoreId();
    // Une boutique supprimée ou désactivée depuis ne doit pas laisser l'écran
    // rattaché à un fantôme : on redemande plutôt que d'afficher du vide.
    setStoreId(saved && stores.some((s) => s.id === saved) ? saved : null);
  }, [stores]);

  function choisir(id: string) {
    writeScreenStoreId(id);
    setStoreId(id);
  }

  function detacher() {
    clearScreenStoreId();
    setStoreId(null);
  }

  if (storeId === undefined) {
    return <div className="p-8 text-sm text-ink-soft">Chargement…</div>;
  }

  if (storeId === null) {
    return (
      <div className="min-h-screen grid place-items-center p-6 bg-bg">
        <div className="card p-6 w-full max-w-lg space-y-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Écran atelier</h1>
            <p className="mt-1 text-sm text-ink-soft">
              À quelle boutique cet écran est-il rattaché ? Le choix est conservé :
              il ne sera pas redemandé au prochain allumage.
            </p>
          </div>
          <div className="space-y-2">
            {stores.length === 0 ? (
              <p className="text-sm text-ink-soft">Aucune boutique active.</p>
            ) : stores.map((s) => (
              <button
                key={s.id}
                onClick={() => choisir(s.id)}
                className="w-full text-left rounded-xl border border-border px-4 py-3 font-medium hover:bg-gray-50 transition-colors"
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Le nom de la boutique et le bouton « Changer » vivent dans la barre de
  // l'écran lui-même : une seconde barre au-dessus mangerait de la hauteur
  // sur un mur où l'on veut voir des commandes, pas des en-têtes.
  return <AtelierScreen stores={stores} lockedStoreId={storeId} onChangeStore={detacher} />;
}
