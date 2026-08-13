/**
 * « Prélèvement » : une sortie d'espèces du tiroir, tracée et déduite des
 * espèces attendues.
 *
 * Le geste s'appelait « remise en banque » ; il a été renommé en
 * « prélèvement », plus large (dépôt en banque, retrait du gérant…). Le
 * mécanisme ne change pas : un mouvement `out` dont le motif porte le mot-clé
 * est déduit du fond de caisse dans la clôture, le Z et les historiques.
 *
 * La reconnaissance reste par mot-clé dans le motif — c'est ainsi que les
 * enregistrements existants sont catégorisés. On accepte donc l'ANCIEN mot
 * (« banque ») ET le nouveau (« prélèvement », avec ou sans accents) : les
 * remises déjà enregistrées restent comptées, les nouveaux prélèvements le
 * sont aussi.
 */

/** Libellé affiché partout pour ce mouvement. */
export const DEPOSIT_LABEL = 'Prélèvement';

/** Motif par défaut proposé dans la modale. */
export const DEFAULT_DEPOSIT_REASON = 'Prélèvement';

/**
 * Condition SQL « ce mouvement est un prélèvement », pour une colonne motif
 * donnée (nom de colonne de confiance, jamais une entrée utilisateur).
 * ILIKE est sensible aux accents : on couvre « prélèvement » et « prelevement ».
 */
export function depositReasonSql(col: string): string {
  return `(${col} ILIKE '%banque%' OR ${col} ILIKE '%prél%' OR ${col} ILIKE '%prel%')`;
}

/** Même règle, côté JS. */
export function isDepositReason(reason: string): boolean {
  return /banque|pr[ée]l/i.test(reason);
}

/** Garantit que le motif saisi sera reconnu comme un prélèvement. */
export function ensureDepositReason(reason: string): string {
  const r = reason.trim() || DEFAULT_DEPOSIT_REASON;
  return isDepositReason(r) ? r : `${DEFAULT_DEPOSIT_REASON} · ${r}`;
}
