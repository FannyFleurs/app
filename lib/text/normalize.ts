/** Minuscules + sans accents, pour une recherche insensible à la casse et
 *  aux accents (ex. « Alencon » retrouve « Alençon », « elise » retrouve
 *  « Élise ») côté client — voir aussi unaccent() côté serveur
 *  (app/api/customers/route.ts). */
export function normSearch(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
