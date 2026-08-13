import { type AccountTotal } from '@/lib/services/accounting-mapping';

/**
 * Mise en page de l'export « Ventes par compte » au format Excel attendu par
 * le comptable, calquée sur le fichier modèle fourni pour Plante Verte.
 *
 * La structure, colonne par colonne :
 *   A : date — le dernier jour de la période (une écriture datée de la fin du
 *       mois clôturé) ;
 *   B : le libellé du compte, tel qu'il est paramétré (« PLANTES 10% PLANTES
 *       VERTES ») ;
 *   C : le repère de période, mois.aa en nombre — 5,26 pour mai 2026, 7,26
 *       pour juillet 2026 ;
 *   D : vide, sauf la ligne « VENTES » (le CA de la période) et la ligne de
 *       total ;
 *   E : les montants — le HT sur la ligne du compte principal, la TVA sur la
 *       ligne du compte de TVA juste en dessous ;
 *   F : le numéro de compte.
 *
 * Chaque famille occupe DEUX lignes : le compte de ventes (HT) puis, dessous,
 * le compte de TVA collectée (TVA). Vient ensuite une ligne « VENTES MM,AAAA »
 * qui porte le CA total en D et le compte 13 en F, une ligne vide, puis une
 * ligne de total qui somme les colonnes D et E. Le total D (le CA) et le total
 * E (HT + TVA) sont par construction égaux : l'écriture est équilibrée.
 *
 * Cette fonction ne fait que POSER les valeurs ; elle ne lit ni la base ni
 * exceljs, ce qui la rend testable seule et garantit que le fichier produit a
 * exactement la forme décrite.
 */

/** Une cellule de la colonne F : un compte, en nombre si le code n'est que des
 *  chiffres (sans zéro de tête à préserver), sinon le texte, sinon vide. */
export function accountCell(code: string | null | undefined): number | string | null {
  const c = (code ?? '').trim();
  if (!c) return null;
  // Round-trip : « 707312 » → 707312, mais « 007 » reste « 007 » (un compte à
  // zéro de tête n'est pas le nombre 7).
  if (/^\d+$/.test(c) && String(Number(c)) === c) return Number(c);
  return c;
}

export interface SalesXlsxRow {
  /** Colonne A. null sur la ligne vide et la ligne de total. */
  date: Date | null;
  /** Colonne B. */
  label: string | null;
  /** Colonne C, repère mois.aa (5.26). null hors des lignes d'écriture. */
  marker: number | null;
  /** Colonne D. */
  d: number | null;
  /** Colonne E. */
  e: number | null;
  /** Colonne F. */
  account: number | string | null;
}

export interface SalesXlsxExport {
  /** Toutes les lignes d'écriture : les deux lignes par famille, puis la ligne
   *  « VENTES ». La ligne vide et la ligne de total sont ajoutées à part par
   *  l'appelant, qui somme les colonnes. */
  rows: SalesXlsxRow[];
  /** Total de la colonne D (le CA de la période). */
  totalD: number;
  /** Total de la colonne E (HT + TVA). Égal à totalD à l'équilibre. */
  totalE: number;
}

function round2(v: number): number { return Math.round(v * 100) / 100; }

/**
 * Construit les lignes de l'export à partir des totaux par compte (les mêmes
 * que l'export CSV « Ventes par compte ») et de la fin de période.
 *
 * @param periodEnd  date de fin, « YYYY-MM-DD ». Sa date sert de colonne A, son
 *                   mois et son année composent le repère et le libellé VENTES.
 */
export function buildSalesXlsx(totals: AccountTotal[], periodEnd: string): SalesXlsxExport {
  const m = Number(periodEnd.slice(5, 7));
  const y = Number(periodEnd.slice(0, 10).slice(0, 4));
  // Midi UTC : la cellule ne bascule pas d'un jour selon le fuseau du serveur.
  const date = new Date(Date.UTC(y, m - 1, Number(periodEnd.slice(8, 10)), 12));
  // Repère mois.aa : mai 2026 → 5 + 26/100 = 5,26.
  const marker = round2(m + (y % 100) / 100);

  const rows: SalesXlsxRow[] = [];
  let totalTtc = 0;
  for (const t of totals) {
    rows.push({ date, label: t.account_label, marker, d: null, e: round2(t.ht), account: accountCell(t.account_code) });
    rows.push({ date, label: t.account_label, marker, d: null, e: round2(t.tva), account: accountCell(t.vat_account_code) });
    totalTtc += t.ttc;
  }
  totalTtc = round2(totalTtc);

  const ventesLabel = `VENTES ${String(m).padStart(2, '0')},${y}`;
  rows.push({ date, label: ventesLabel, marker, d: totalTtc, e: null, account: 13 });

  const totalD = round2(rows.reduce((s, r) => s + (r.d ?? 0), 0));
  const totalE = round2(rows.reduce((s, r) => s + (r.e ?? 0), 0));
  return { rows, totalD, totalE };
}
