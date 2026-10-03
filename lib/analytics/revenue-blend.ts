import { query } from '@/lib/db/client';

/**
 * CA couvert UNIQUEMENT par l'historique importé (revenue_history, migration
 * 0076) — les couples (boutique, jour) de la période qui n'ont AUCUNE vente
 * réelle validée. À ADDITIONNER au CA réel déjà calculé par l'appelant,
 * JAMAIS à le remplacer : les requêtes CA réel (ex. app/api/ca/summary)
 * excluent délibérément certaines lignes (ex. émission de carte cadeau, hors
 * CA) via sale_lines — un blend qui repartirait de sales.total_ttc perdrait
 * cette exclusion pour les jours qui ONT des ventes réelles. En ne couvrant
 * que les jours SANS vente réelle, cette fonction ne touche jamais aux jours
 * déjà correctement calculés.
 *
 * Même règle de priorité que `blendedDaily` dans
 * app/api/analytics/dashboard/route.ts (le tableau de bord back-office, qui
 * blend différemment — par SOMME de sales.total_ttc — parce qu'il n'a pas
 * cette exclusion carte cadeau à préserver) : ventes réelles prioritaires,
 * import seulement pour combler les trous.
 *
 * Seuls ca_ttc/ca_ht/tickets existent dans revenue_history (voir la
 * migration) : marge, TVA, remises, clients restent uniquement issus des
 * ventes réelles — un import ne les contient pas.
 */

interface ImportOnlyArgs {
  organizationId: string;
  from: string;
  to: string;
  storeId?: string | null;
}

export interface ImportOnlyCaTotal { ca_ttc: number; ca_ht: number; tickets: number }

/** Total importé non couvert par une vente réelle, sur la période (toutes boutiques, ou une seule si storeId est fourni). */
export async function importOnlyCaTotal(input: ImportOnlyArgs): Promise<ImportOnlyCaTotal> {
  const { organizationId, from, to, storeId } = input;
  const args: unknown[] = [organizationId, from, to];
  let storeFilter = '';
  if (storeId) { args.push(storeId); storeFilter = `AND rh.store_id = $${args.length}`; }

  const r = await query<{ ca_ttc: string; ca_ht: string; tickets: number }>(
    `SELECT COALESCE(SUM(rh.ca_ttc), 0)::text AS ca_ttc,
            COALESCE(SUM(rh.ca_ht), 0)::text  AS ca_ht,
            COALESCE(SUM(rh.tickets), 0)::int AS tickets
       FROM revenue_history rh
      WHERE rh.organization_id = $1
        AND rh.day BETWEEN $2::date AND $3::date
        ${storeFilter}
        AND NOT EXISTS (
          SELECT 1 FROM sales s
           WHERE s.organization_id = rh.organization_id
             AND s.store_id = rh.store_id
             AND s.status = 'validated'
             AND (s.validated_at AT TIME ZONE 'Europe/Paris')::date = rh.day
        )`,
    args,
  );
  const row = r.rows[0]!;
  return { ca_ttc: Number(row.ca_ttc), ca_ht: Number(row.ca_ht), tickets: row.tickets };
}

/** Même règle, DÉTAILLÉE PAR BOUTIQUE (toutes les boutiques de l'organisation). */
export async function importOnlyCaByStore(
  input: Omit<ImportOnlyArgs, 'storeId'>,
): Promise<Map<string, ImportOnlyCaTotal>> {
  const { organizationId, from, to } = input;
  const r = await query<{ store_id: string; ca_ttc: string; ca_ht: string; tickets: number }>(
    `SELECT rh.store_id::text AS store_id,
            COALESCE(SUM(rh.ca_ttc), 0)::text AS ca_ttc,
            COALESCE(SUM(rh.ca_ht), 0)::text  AS ca_ht,
            COALESCE(SUM(rh.tickets), 0)::int AS tickets
       FROM revenue_history rh
      WHERE rh.organization_id = $1
        AND rh.day BETWEEN $2::date AND $3::date
        AND NOT EXISTS (
          SELECT 1 FROM sales s
           WHERE s.organization_id = rh.organization_id
             AND s.store_id = rh.store_id
             AND s.status = 'validated'
             AND (s.validated_at AT TIME ZONE 'Europe/Paris')::date = rh.day
        )
      GROUP BY rh.store_id`,
    [organizationId, from, to],
  );
  return new Map(r.rows.map((row) => [
    row.store_id,
    { ca_ttc: Number(row.ca_ttc), ca_ht: Number(row.ca_ht), tickets: row.tickets },
  ]));
}
