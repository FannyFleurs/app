import 'server-only';
import type { PoolClient } from 'pg';
import { query } from '@/lib/db/client';
import { CashSessionService } from './cash-session-service';

/**
 * Encaissements externes à rattacher à une session de caisse — brique
 * GÉNÉRIQUE (voir migration 0086) : sert aujourd'hui à l'achat en ligne
 * d'une carte cadeau (paiement Stripe confirmé par webhook, à un instant
 * qui ne correspond pas forcément à une session de caisse ouverte pour la
 * boutique), conçue pour pouvoir accueillir plus tard d'autres encaissements
 * externes (`kind`/`source_type` sont des enums extensibles), sans
 * sur-concevoir avant un besoin réel.
 */

export interface CreatePendingStoreOperationArgs {
  organizationId: string;
  storeId: string;
  kind: 'online_gift_card';
  amountCents: number;
  currency: string;
  /** Libellé d'affichage dans les rapports caisse (Z/day-report), ex.
   *  "Carte cadeau en ligne / Stripe". */
  paymentLabel: string;
  /** Date/heure RÉELLE de l'encaissement (ex. confirmation Stripe) — jamais
   *  réécrite ensuite, y compris en cas d'affectation différée. */
  occurredAt: string;
  sourceType: 'online_gift_card_order';
  sourceId: string;
}

/**
 * Enregistre un encaissement externe pour une boutique, rattaché
 * IMMÉDIATEMENT à la session de caisse ouverte de cette boutique si elle
 * existe, sinon laissé EN ATTENTE (`cash_session_id` NULL) — voir migration
 * 0086 et `assignPendingStoreOperations` ci-dessous.
 *
 * Idempotent : un appel répété pour la MÊME source (webhook Stripe rejoué)
 * ne crée jamais de seconde ligne (contrainte UNIQUE (source_type,
 * source_id)) — renvoie la ligne déjà existante, sans tenter de la
 * ré-affecter (l'affectation initiale — immédiate ou différée — fait foi).
 */
export async function createPendingStoreOperation(
  args: CreatePendingStoreOperationArgs,
): Promise<{ id: string; cashSessionId: string | null }> {
  const existing = await query<{ id: string; cash_session_id: string | null }>(
    `SELECT id, cash_session_id FROM pending_store_operations WHERE source_type = $1 AND source_id = $2`,
    [args.sourceType, args.sourceId],
  );
  if (existing.rows[0]) {
    return { id: existing.rows[0]!.id, cashSessionId: existing.rows[0]!.cash_session_id };
  }

  // Session ouverte de la boutique au moment de l'encaissement, si elle
  // existe : rattachement immédiat. Sinon la ligne reste en attente — sera
  // affectée à la prochaine ouverture par assignPendingStoreOperations.
  const openSession = await CashSessionService.getOpenForStore(args.storeId);

  try {
    const { rows } = await query<{ id: string; cash_session_id: string | null }>(
      `INSERT INTO pending_store_operations
         (organization_id, store_id, kind, amount_cents, currency, payment_label,
          occurred_at, cash_session_id, assigned_at, source_type, source_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $8::uuid IS NULL THEN NULL ELSE now() END,$9,$10)
       RETURNING id, cash_session_id`,
      [
        args.organizationId, args.storeId, args.kind, args.amountCents, args.currency, args.paymentLabel,
        args.occurredAt, openSession?.id ?? null, args.sourceType, args.sourceId,
      ],
    );
    return { id: rows[0]!.id, cashSessionId: rows[0]!.cash_session_id };
  } catch (err) {
    // Course concurrente sur la même source (webhook rejoué en parallèle) :
    // relit la ligne créée par l'autre appel plutôt que d'échouer.
    const pgErr = err as { code?: string };
    if (pgErr.code === '23505') {
      const retry = await query<{ id: string; cash_session_id: string | null }>(
        `SELECT id, cash_session_id FROM pending_store_operations WHERE source_type = $1 AND source_id = $2`,
        [args.sourceType, args.sourceId],
      );
      if (retry.rows[0]) return { id: retry.rows[0]!.id, cashSessionId: retry.rows[0]!.cash_session_id };
    }
    throw err;
  }
}

/**
 * Affecte à `cashSessionId` toutes les opérations encore en attente de la
 * boutique. Appelée par `CashSessionService.open()` juste après l'ouverture
 * (ou la jonction, en fonds commun) d'une session, DANS LA MÊME transaction
 * — un crash entre les deux ne doit jamais laisser une session ouverte sans
 * que les opérations en attente lui aient été rattachées. Ne modifie
 * jamais `occurred_at` (date réelle de l'encaissement, immuable).
 */
export async function assignPendingStoreOperations(
  client: PoolClient,
  storeId: string,
  cashSessionId: string,
): Promise<void> {
  await client.query(
    `UPDATE pending_store_operations
        SET cash_session_id = $2, assigned_at = now(), updated_at = now()
      WHERE store_id = $1 AND cash_session_id IS NULL`,
    [storeId, cashSessionId],
  );
}
