import { query } from '@/lib/db/client';
import { CA_EXCLUSIONS_KEY, mergeCaExclusionsDefaults, type CaExclusionsSettings } from '@/lib/settings/ca-exclusions';

/**
 * Exclusions du CA boutique (voir lib/settings/ca-exclusions.ts) résolues en
 * listes prêtes pour le SQL : ids clients, libellés de règlement (en
 * minuscules, comparés à payments.label), ids catégories produit.
 */
export interface ResolvedCaExclusions {
  customerIds: string[];
  paymentLabels: string[];
  categoryIds: string[];
}

export async function loadCaExclusions(organizationId: string): Promise<ResolvedCaExclusions> {
  const { rows } = await query<{ value: Partial<CaExclusionsSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [organizationId, CA_EXCLUSIONS_KEY],
  );
  const settings = mergeCaExclusionsDefaults(rows[0]?.value ?? null);

  const customerIds: string[] = [];
  const paymentLabels: string[] = [];
  const categoryIds: string[] = [];
  for (const e of settings.entries) {
    if (e.type === 'customer') customerIds.push(e.id);
    else if (e.type === 'category') categoryIds.push(e.id);
    else paymentLabels.push(e.label.trim().toLowerCase());
  }
  return { customerIds, paymentLabels, categoryIds };
}

export function hasExclusions(r: ResolvedCaExclusions): boolean {
  return r.customerIds.length > 0 || r.paymentLabels.length > 0 || r.categoryIds.length > 0;
}

/**
 * Condition SQL excluant les ventes « hors boutique » : client exclu, OU au
 * moins un règlement dont le libellé figé correspond à un mode de paiement
 * exclu, OU au moins une ligne dont la catégorie (celle du produit, ou
 * sl.category_id pour une ligne sans produit — commande web/OGF, même
 * COALESCE que partout ailleurs où le CA est réparti par catégorie) est
 * exclue. Dès qu'un de ces 3 critères touche la vente, la vente sort EN
 * ENTIER du CA boutique (voir discussion produit : un règlement mixte
 * carte/Chorus reste une vente administrative, pas de la boutique).
 *
 * Pousse 3 paramètres (toujours les 3, même vides) à la fin de `args` et
 * renvoie le fragment à concaténer à la clause WHERE (` AND NOT (...)`), ou
 * '' si aucune exclusion n'est configurée (rien à faire, on ne touche pas à
 * `args`). `alias` est l'alias SQL de `sales` dans la requête appelante
 * (par défaut `s`, comme partout dans ce codebase). `nullable` doit être
 * mis à true quand `sales` est en LEFT JOIN et peut être NULL (ex.
 * /api/ca/returns, credit_notes sans vente associée) : la ligne reste alors
 * incluse plutôt que silencieusement supprimée par le NOT.
 */
export function excludeNonStoreSalesSql(
  r: ResolvedCaExclusions,
  args: unknown[],
  opts: { alias?: string; nullable?: boolean } = {},
): string {
  if (!hasExclusions(r)) return '';
  const alias = opts.alias ?? 's';
  const custIdx = args.push(r.customerIds);
  const payIdx = args.push(r.paymentLabels);
  const catIdx = args.push(r.categoryIds);
  const cond = `(
       (${alias}.customer_id IS NOT NULL AND ${alias}.customer_id = ANY($${custIdx}::uuid[]))
    OR EXISTS (SELECT 1 FROM payments pay_excl
                WHERE pay_excl.sale_id = ${alias}.id
                  AND LOWER(COALESCE(pay_excl.label, '')) = ANY($${payIdx}::text[]))
    OR EXISTS (SELECT 1 FROM sale_lines sl_excl
                LEFT JOIN products p_excl ON p_excl.id = sl_excl.product_id
               WHERE sl_excl.sale_id = ${alias}.id
                 AND COALESCE(p_excl.category_id, sl_excl.category_id) = ANY($${catIdx}::uuid[]))
  )`;
  return opts.nullable
    ? ` AND (${alias}.id IS NULL OR NOT ${cond})`
    : ` AND NOT ${cond}`;
}

/**
 * Pousse les 3 mêmes tableaux d'exclusion sur un AUTRE jeu de paramètres
 * (ex. `argsPrev` à côté de `argsCur` dans /api/analytics/dashboard), SANS
 * regénérer le texte SQL : tant que ce 2e tableau a la même longueur que le
 * premier au moment de l'appel, les index $N générés par
 * excludeNonStoreSalesSql restent valables pour les deux — la condition
 * SQL (closure partagée) peut donc s'appliquer telle quelle aux requêtes
 * utilisant l'un ou l'autre tableau.
 */
export function pushExclusionParams(r: ResolvedCaExclusions, args: unknown[]): void {
  if (!hasExclusions(r)) return;
  args.push(r.customerIds, r.paymentLabels, r.categoryIds);
}
