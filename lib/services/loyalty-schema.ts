import type { PoolClient } from 'pg';

/**
 * Détecte si la colonne `loyalty_accounts.group_key` (migration 0034) est
 * présente. Tant qu'elle ne l'est pas, on retombe sur le modèle historique
 * (un compte fidélité par client, tous magasins confondus) — de sorte que
 * la validation des ventes ne casse JAMAIS si la migration n'est pas encore
 * appliquée. Résultat mis en cache une fois positif.
 */
let ready = false;

export async function loyaltyGroupReady(
  client: Pick<PoolClient, 'query'>,
): Promise<boolean> {
  if (ready) return true;
  try {
    const r = await client.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'loyalty_accounts'
          AND column_name = 'group_key'
        LIMIT 1`,
    );
    ready = (r.rowCount ?? 0) > 0;
  } catch {
    /* on garde false : modèle historique */
  }
  return ready;
}
