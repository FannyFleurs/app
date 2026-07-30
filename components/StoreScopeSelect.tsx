'use client';

/**
 * Sélecteur de boutique réutilisable en tête des pages de réglages « par
 * boutique ». Affiche le libellé « Boutique » + un menu déroulant. Masqué s'il
 * n'y a qu'une seule boutique (rien à choisir), mais l'appelant conserve la
 * valeur sélectionnée pour scoper ses requêtes.
 */
export default function StoreScopeSelect({
  stores, value, onChange, hideWhenSingle = false, lockedStoreId,
}: {
  stores: { id: string; name: string }[];
  value: string;
  onChange: (storeId: string) => void;
  hideWhenSingle?: boolean;
  /** Sur un poste de caisse appairé : la boutique est verrouillée (autonomie
   *  boutique). On affiche son nom en lecture seule, sans menu déroulant. Le
   *  choix multi-boutiques reste réservé au back-office. */
  lockedStoreId?: string | null;
}) {
  if (stores.length === 0) return null;
  // Poste de caisse appairé : boutique verrouillée → aucun sélecteur affiché
  // (chaque boutique édite la sienne ; le multi reste au back-office).
  if (lockedStoreId) return null;
  if (hideWhenSingle && stores.length === 1) return null;
  return (
    <label className="text-sm">
      <span className="block text-xs font-medium text-ink-soft mb-1">Boutique</span>
      <select
        className="input h-10 min-w-[12rem]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>
  );
}
