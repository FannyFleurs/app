/**
 * Exclusions du CA boutique — liste configurable (Réglages ▸ Exclusions du
 * CA boutique) permettant d'isoler, dans le Tableau de bord et l'app CA, les
 * ventes qui ne sont pas du CA « fait en boutique » (ex. client OGF, mode de
 * paiement Web ou Chorus Pro, catégorie produit Mariage). Persisté dans la
 * table `settings` sous la clé `ca_exclusions`, au niveau organisation (pas
 * de boutique — les canaux concernés traversent les boutiques).
 *
 * Trois types d'entrée :
 *   - customer : une fiche client (ex. OGF Services Financiers).
 *   - payment_method : comparé au libellé FIGÉ sur chaque règlement
 *     (payments.label, voir migration 0094) — pas à payment_methods.label,
 *     qui peut changer après coup sans affecter l'historique.
 *   - category : une catégorie produit (ex. Mariage) — une vente est exclue
 *     si au moins UNE de ses lignes porte cette catégorie.
 *
 * Voir lib/analytics/store-ca-exclusions.ts pour la condition SQL qui
 * applique cette liste aux requêtes de CA.
 */

export const CA_EXCLUSIONS_KEY = 'ca_exclusions';

export type CaExclusionEntry =
  | { type: 'customer'; id: string; label: string }
  | { type: 'payment_method'; label: string }
  | { type: 'category'; id: string; label: string };

export interface CaExclusionsSettings {
  entries: CaExclusionEntry[];
}

export const CA_EXCLUSIONS_DEFAULTS: CaExclusionsSettings = { entries: [] };

function isValidEntry(e: unknown): e is CaExclusionEntry {
  if (!e || typeof e !== 'object') return false;
  const r = e as Record<string, unknown>;
  if (r.type === 'customer' || r.type === 'category') {
    return typeof r.id === 'string' && r.id.length > 0
      && typeof r.label === 'string' && r.label.length > 0;
  }
  if (r.type === 'payment_method') {
    return typeof r.label === 'string' && r.label.trim().length > 0;
  }
  return false;
}

/**
 * Valide/nettoie la valeur persistée. Une entrée invalide (forme inconnue,
 * donnée corrompue) est silencieusement écartée plutôt que de faire échouer
 * tout le réglage — même posture que mergeDiscountReasonsDefaults.
 */
export function mergeCaExclusionsDefaults(
  partial: { entries?: unknown[] } | null | undefined,
): CaExclusionsSettings {
  const raw = partial?.entries;
  if (!Array.isArray(raw)) return { entries: [] };
  return { entries: raw.filter(isValidEntry) };
}
