/**
 * Correspondance « ligne de vente → compte comptable de ventes ».
 *
 * Le comptable ne veut pas un total de ventes : il veut le détail par famille
 * de produit, par taux de TVA et par boutique — un compte par croisement, avec
 * son libellé. Ce module ne fait que CHOISIR la règle applicable ; il ne lit ni
 * n'écrit rien, ce qui le rend testable seul et garantit que l'export et
 * l'écran de paramétrage s'accordent sur la même logique.
 */

export interface SalesAccountRule {
  id: string;
  /** null = toutes les boutiques. */
  store_id: string | null;
  /** null = toutes les familles, y compris les articles sans famille. */
  category_id: string | null;
  /** null = tous les taux. En pourcentage : 20, 10, 5.5… */
  vat_rate: number | null;
  account_code: string;
  account_label: string;
  /** Compte de TVA collectée. Null = compte global du taux. */
  vat_account_code?: string | null;
  vat_account_label?: string | null;
}

export interface SalesLineScope {
  store_id: string | null;
  category_id: string | null;
  vat_rate: number;
}

/** Deux taux issus de `numeric` ou d'une saisie : comparés au centième. */
export function sameRate(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 0.005;
}

/**
 * Spécificité d'une règle : plus une règle contraint de critères, plus elle
 * l'emporte. La boutique pèse plus lourd que la famille, elle-même plus lourde
 * que le taux — l'ordre naturel de lecture d'un plan de comptes, où l'on
 * décline d'abord par établissement.
 */
function specificity(r: SalesAccountRule): number {
  return (r.store_id ? 4 : 0) + (r.category_id ? 2 : 0) + (r.vat_rate !== null ? 1 : 0);
}

/** La règle s'applique-t-elle à cette ligne ? Un critère nul accepte tout. */
function matches(r: SalesAccountRule, s: SalesLineScope): boolean {
  if (r.store_id !== null && r.store_id !== s.store_id) return false;
  if (r.category_id !== null && r.category_id !== s.category_id) return false;
  if (r.vat_rate !== null && !sameRate(r.vat_rate, s.vat_rate)) return false;
  return true;
}

/**
 * Règle applicable à une ligne de vente, la plus spécifique d'abord.
 * Renvoie null si rien ne correspond — l'appelant retombe alors sur le compte
 * de ventes global plutôt que d'inventer un numéro.
 */
export function resolveSalesAccount(
  rules: SalesAccountRule[], scope: SalesLineScope,
): SalesAccountRule | null {
  let best: SalesAccountRule | null = null;
  let bestScore = -1;
  for (const r of rules) {
    if (!matches(r, scope)) continue;
    const score = specificity(r);
    // À spécificité égale l'index unique garantit qu'il n'y a qu'une règle :
    // le `>` strict n'a donc pas à départager deux candidates équivalentes.
    if (score > bestScore) { best = r; bestScore = score; }
  }
  return best;
}

/**
 * Regroupe des lignes de vente par compte, en sommant les montants.
 *
 * L'ordre de sortie suit le numéro de compte : c'est celui du grand livre, et
 * celui dans lequel un comptable relit ses écritures.
 */
export interface SalesAmount {
  ht: number;
  tva: number;
  ttc: number;
}

export interface AccountTotal extends SalesAmount {
  /** Vide tant qu'aucune règle ne couvre le croisement — voir `fallback`. */
  account_code: string;
  account_label: string;
  /**
   * Aucune règle ne couvrait ces lignes. Leur numéro de compte reste vide :
   * en inventer un (un « compte de ventes global ») revenait à ranger sous un
   * numéro plausible ce que personne n'avait décidé, et le comptable ne
   * distinguait plus ce qu'il avait paramétré de ce qu'il subissait.
   */
  fallback: boolean;
  /** Compte de TVA de la règle, si elle en porte un. */
  vat_account_code: string | null;
  vat_account_label: string | null;
  /**
   * Taux des lignes agrégées. Sert à retomber sur le compte de TVA global
   * quand la règle n'en précise pas : sans lui, on ne saurait pas lequel des
   * comptes 4457… choisir.
   */
  vat_rate: number;
}

export function groupByAccount(
  lines: Array<SalesLineScope & SalesAmount & { category_name?: string | null; store_name?: string | null }>,
  rules: SalesAccountRule[],
): AccountTotal[] {
  const byKey = new Map<string, AccountTotal>();
  for (const l of lines) {
    const rule = resolveSalesAccount(rules, l);
    const code = rule?.account_code ?? '';
    // Le libellé nomme le croisement resté sans règle : le comptable voit ainsi
    // CE qui manque, au lieu d'un fourre-tout muet.
    const label = rule?.account_label ?? [
      l.category_name ?? 'Sans famille',
      `${formatRate(l.vat_rate)} %`,
      l.store_name ?? null,
    ].filter(Boolean).join(' · ');
    // Le taux entre dans la clé : deux taux partageant un compte de ventes
    // n'en partagent pas forcément le compte de TVA, et les fondre rendrait
    // la ventilation de TVA impossible à reconstituer.
    const key = `${code}|${label}|${l.vat_rate}`;
    const cur: AccountTotal = byKey.get(key) ?? {
      account_code: code, account_label: label, ht: 0, tva: 0, ttc: 0, fallback: !rule,
      vat_account_code: rule?.vat_account_code ?? null,
      vat_account_label: rule?.vat_account_label ?? null,
      vat_rate: l.vat_rate,
    };
    cur.ht += l.ht; cur.tva += l.tva; cur.ttc += l.ttc;
    byKey.set(key, cur);
  }
  return [...byKey.values()]
    .map((t) => ({ ...t, ht: round2(t.ht), tva: round2(t.tva), ttc: round2(t.ttc) }))
    .sort((a, b) => a.account_code.localeCompare(b.account_code)
      || a.account_label.localeCompare(b.account_label));
}

function round2(v: number): number { return Math.round(v * 100) / 100; }

/** Taux affiché sans décimale inutile : 20 et non 20,00 ; 5,5 et non 5,50. */
export function formatRate(rate: number): string {
  return String(Math.round(rate * 100) / 100).replace('.', ',');
}
