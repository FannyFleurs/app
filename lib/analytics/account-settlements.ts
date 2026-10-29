/**
 * Règlements de solde « en compte » (depuis la fiche client, la caisse ou
 * Facturation → « Solder la facture ») à unir aux paiements de vente du jour
 * pour la réconciliation de clôture.
 *
 * Un règlement de solde n'est pas une vente : il n'apparaît jamais dans
 * `payments` (toujours lié à un `sale_id`). Pour les ESPÈCES, l'argent
 * entrant dans le tiroir est déjà tracé via `cash_movements` (compté dans
 * `cash_expected`) — les inclure ici aussi les compterait deux fois, d'où
 * l'exclusion explicite de `method = 'cash'`. Pour les AUTRES modes (carte,
 * chèque…), il n'existe aucun autre mécanisme de réconciliation : sans cette
 * union, un règlement carte sur une facture de période restait invisible du
 * montant « attendu » comparé au relevé du terminal, bien que l'argent ait
 * réellement été encaissé ce jour-là.
 *
 * Fragment de requête, pas une fonction : conçu pour être inséré tel quel
 * dans un `UNION ALL` d'une requête hôte qui porte déjà $1=store_id,
 * $2=date, $3=periodStart (même convention que EXCLUDE_GIFT_CARD_ISSUANCE_SQL
 * et depositReasonSql).
 */
export const SETTLEMENT_PAYMENTS_UNION_SQL = `
  SELECT asp.method AS method, asp.amount AS amount
    FROM account_settlement_payments asp
   WHERE asp.store_id = $1
     AND asp.method <> 'cash'
     AND (asp.created_at AT TIME ZONE 'Europe/Paris')::date = $2::date
     AND ($3::timestamptz IS NULL OR asp.created_at > $3)
`;
