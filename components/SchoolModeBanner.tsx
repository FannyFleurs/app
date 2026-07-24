'use client';
import { confirmThemed } from '@/lib/ui/dialog';

import { useSchoolMode, deactivateSchoolMode } from '@/lib/school-mode';

/**
 * Bandeau rouge affiché en permanence quand le mode école est actif,
 * pour rappeler que rien ne s'enregistre. Bouton "Quitter le mode école"
 * qui purge les données locales et recharge la page.
 */
export default function SchoolModeBanner() {
  const active = useSchoolMode();
  if (!active) return null;

  async function exit() {
    if (!(await confirmThemed({ title: 'Quitter le mode école', message: 'Toutes les ventes fictives et données de démonstration vont être supprimées.' }))) {
      return;
    }
    deactivateSchoolMode();
    // Recharge la page pour repartir sur un état propre côté serveur.
    window.location.reload();
  }

  return (
    <div
      className="sticky top-0 z-[100] bg-warning text-white px-3 py-2 flex items-center justify-between gap-3 text-sm shadow-md"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-warning text-[10px] font-bold shrink-0">
          ⓘ
        </span>
        <span className="font-medium truncate">
          MODE ÉCOLE — aucune vente n&apos;est enregistrée
        </span>
      </div>
      <button
        onClick={exit}
        className="bg-white text-warning text-xs font-semibold px-2.5 py-1 rounded-md hover:opacity-90 shrink-0"
      >
        Quitter
      </button>
    </div>
  );
}
