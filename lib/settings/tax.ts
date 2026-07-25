/**
 * Réglages TVA par boutique. Les TAUX (20/10/5,5/0…) restent partagés au
 * niveau organisation (ils sont légalement fixes) ; ce qui varie par boutique,
 * c'est le taux appliqué par DÉFAUT (ex. une boutique « plantes » par défaut à
 * 10 %, une boutique « accessoires » à 20 %). On stocke ce défaut par boutique
 * dans la table `settings`, en encodant l'id boutique dans la clé — comme pour
 * l'email et le ticket.
 */

export const TAX_KEY = 'tax';

export function taxKey(storeId?: string | null): string {
  return storeId ? `tax:${storeId}` : TAX_KEY;
}

export interface TaxStoreSettings {
  /** Code du taux TVA par défaut pour la boutique (ex. 'TVA10'). */
  default_code: string | null;
}

export function mergeTaxDefaults(v: Partial<TaxStoreSettings> | null | undefined): TaxStoreSettings {
  return { default_code: v?.default_code ?? null };
}
