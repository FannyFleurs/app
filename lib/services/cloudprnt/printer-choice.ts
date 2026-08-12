/**
 * À quelle imprimante appartient un document ?
 *
 * UNE IMPRIMANTE APPARTIENT À UNE BOUTIQUE. Quand la boutique est connue, on
 * ne sort JAMAIS de cette boutique : son imprimante, ou à défaut une
 * imprimante déclarée sans boutique — configuration volontaire, qui veut dire
 * « celle-ci sert tout le monde ». S'il n'y en a aucune des deux, on ne trouve
 * rien, et c'est la bonne réponse.
 *
 * Le repli qui existait ici — « sinon la première active » — envoyait le
 * document dans une AUTRE boutique. Une clôture d'Alençon est sortie sur
 * l'imprimante de Mortagne, la seule enregistrée : un rapport Z, avec le fond
 * de caisse et le détail des encaissements, imprimé dans un magasin qui n'est
 * pas le sien. Ne pas imprimer est un incident visible, que l'on corrige en
 * déclarant l'imprimante ; imprimer ailleurs est un incident invisible.
 *
 * Boutique inconnue : l'imprimante « organisation », sinon l'unique imprimante
 * s'il n'y en a qu'une. À plusieurs, on ne devine pas — se tromper de magasin
 * coûte plus cher que de ne rien sortir.
 *
 * Ce module ne touche pas la base : c'est la règle seule, donc testable seule.
 */
export function choisirImprimante<T extends { store_id: string | null }>(
  rows: T[], storeId?: string | null,
): T | null {
  if (rows.length === 0) return null;
  if (storeId) {
    return rows.find((p) => p.store_id === storeId)
      ?? rows.find((p) => p.store_id === null)
      ?? null;
  }
  return rows.find((p) => p.store_id === null) ?? (rows.length === 1 ? rows[0]! : null);
}
