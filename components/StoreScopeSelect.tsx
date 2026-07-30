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
  if (lockedStoreId) {
    const name = stores.find((s) => s.id === lockedStoreId)?.name ?? 'Cette boutique';
    return (
      <div className="text-sm">
        <span className="block text-xs font-medium text-ink-soft mb-1">Boutique</span>
        <div className="input h-10 min-w-[12rem] inline-flex items-center bg-gray-50 text-ink">{name}</div>
      </div>
    );
  }
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
