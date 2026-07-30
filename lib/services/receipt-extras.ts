import { query } from '@/lib/db/client';

/**
 * Données « annexes » du ticket, résolues à l'impression (hors snapshot fiscal) :
 *  - le nom du client rattaché à la vente ;
 *  - l'activité fidélité de CE ticket (points gagnés / utilisés + solde figé
 *    au moment de la vente, lu dans loyalty_movements).
 *
 * Lecture seule : n'altère jamais le snapshot immuable du reçu. Sûr à rejouer
 * sur une réimpression — les valeurs proviennent des mouvements figés de la
 * vente, donc identiques dans le temps.
 */
export async function loadReceiptExtras(
  organizationId: string,
  saleId: string,
): Promise<{
  customerName: string | null;
  loyalty: { earned: number; balance: number; redeemed: number } | null;
}> {
  const cust = await query<{ name: string | null }>(
    `SELECT COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS name
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.id = $1 AND s.organization_id = $2`,
    [saleId, organizationId],
  ).catch(() => ({ rows: [] as { name: string | null }[] }));
  const customerName = cust.rows[0]?.name ?? null;

  const loy = await query<{ earned: number; redeemed: number; balance: number | null }>(
    `SELECT
        COALESCE(SUM(CASE WHEN movement_type = 'earn'   THEN points_delta  ELSE 0 END), 0)::int AS earned,
        COALESCE(SUM(CASE WHEN movement_type = 'redeem' THEN -points_delta ELSE 0 END), 0)::int AS redeemed,
        (SELECT balance_after FROM loyalty_movements
          WHERE organization_id = $1 AND source_type = 'sale' AND source_id = $2
          ORDER BY created_at DESC, id DESC LIMIT 1) AS balance
       FROM loyalty_movements
      WHERE organization_id = $1 AND source_type = 'sale' AND source_id = $2`,
    [organizationId, saleId],
  ).catch(() => ({ rows: [] as { earned: number; redeemed: number; balance: number | null }[] }));
  const lr = loy.rows[0];
  const loyalty = lr && (lr.earned > 0 || lr.redeemed > 0 || lr.balance != null)
    ? { earned: lr.earned, redeemed: lr.redeemed, balance: lr.balance ?? 0 }
    : null;

  return { customerName, loyalty };
}
