import type { PoolClient } from 'pg';
import { computeEventHash } from './hash';
import { GENESIS_HASH } from './hash';
import type {
  FiscalEventInput,
  FiscalEventRecord,
  FiscalEventType,
} from './types';

/**
 * FiscalCore
 * ----------
 * Source unique de vérité pour :
 *   - la chaîne d'événements fiscaux (hash chain)
 *   - la numérotation séquentielle sans rupture
 *   - le cumul perpétuel (grand_total_ttc)
 *
 * Toutes les opérations sensibles DOIVENT passer par ce module et être
 * exécutées dans la même transaction que l'écriture métier (sale, invoice,
 * closure, etc.), via `withTransaction()`.
 *
 * Sécurité :
 *   - L'index séquentiel et le hash précédent sont lus avec FOR UPDATE
 *     sur fiscal_chain_state pour garantir l'absence de race.
 *   - Le hash combine le précédent + index + type + payload canonique,
 *     éventuellement signé HMAC avec FISCAL_SIGNING_KEY.
 *   - Une fois écrits, les fiscal_events sont protégés au niveau Postgres
 *     par un trigger interdisant UPDATE/DELETE.
 */
export class FiscalCore {
  constructor(private readonly client: PoolClient) {}

  private signingKey(): string | undefined {
    const key = process.env.FISCAL_SIGNING_KEY;
    if (!key || key.includes('change-me')) return undefined;
    return key;
  }

  /**
   * Initialise l'état de chaîne pour une organisation (idempotent).
   */
  async ensureChainState(organizationId: string): Promise<void> {
    await this.client.query(
      `INSERT INTO fiscal_chain_state (organization_id)
       VALUES ($1) ON CONFLICT DO NOTHING`,
      [organizationId],
    );
  }

  /**
   * Écrit un événement fiscal et fait avancer la chaîne.
   * Renvoie l'événement créé. À appeler DANS une transaction.
   */
  async recordEvent(input: FiscalEventInput): Promise<FiscalEventRecord> {
    await this.ensureChainState(input.organizationId);

    // Lock atomique sur l'état de la chaîne
    const stateRes = await this.client.query<{
      next_index: string;
      last_hash: string;
      grand_total_ttc: string;
    }>(
      `SELECT next_index, last_hash, grand_total_ttc
       FROM fiscal_chain_state
       WHERE organization_id = $1
       FOR UPDATE`,
      [input.organizationId],
    );

    if (stateRes.rowCount === 0) {
      throw new Error('FISCAL_CHAIN_STATE_MISSING');
    }

    const row = stateRes.rows[0]!;
    const nextIndex = BigInt(row.next_index);
    const previousHash = row.last_hash || GENESIS_HASH;
    const previousGrandTotal = Number(row.grand_total_ttc);
    const delta = Number(input.amountTtcDelta ?? 0);
    const newGrandTotal = Number((previousGrandTotal + delta).toFixed(4));

    const enrichedPayload = {
      ...input.payload,
      _meta: {
        previous_grand_total_ttc: previousGrandTotal,
        amount_ttc_delta: delta,
        new_grand_total_ttc: newGrandTotal,
        immutable_index: nextIndex.toString(),
      },
    };

    const currentHash = computeEventHash({
      previousHash,
      immutableIndex: nextIndex,
      eventType: input.eventType,
      payload: enrichedPayload,
      signingKey: this.signingKey(),
    });

    const insertRes = await this.client.query<{
      id: string;
      immutable_index: string;
      created_at: string;
    }>(
      `INSERT INTO fiscal_events
         (organization_id, store_id, register_id, user_id,
          immutable_index, event_type, entity_type, entity_id,
          payload, previous_hash, current_hash, signature_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, immutable_index, created_at`,
      [
        input.organizationId,
        input.storeId ?? null,
        input.registerId ?? null,
        input.userId ?? null,
        nextIndex.toString(),
        input.eventType,
        input.entityType,
        input.entityId ?? null,
        JSON.stringify(enrichedPayload),
        previousHash,
        currentHash,
        1,
      ],
    );

    await this.client.query(
      `UPDATE fiscal_chain_state
         SET next_index = next_index + 1,
             last_hash = $2,
             grand_total_ttc = $3,
             updated_at = now()
       WHERE organization_id = $1`,
      [input.organizationId, currentHash, newGrandTotal],
    );

    const inserted = insertRes.rows[0]!;
    return {
      id: inserted.id,
      immutableIndex: inserted.immutable_index,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      previousHash,
      currentHash,
      payload: enrichedPayload,
      createdAt: inserted.created_at,
    };
  }

  /**
   * Numérotation séquentielle sans rupture (par org + kind + année).
   * Format renvoyé : `${prefix}-${year}-${value zero-padded}`
   */
  async nextDocumentNumber(args: {
    organizationId: string;
    kind: 'receipt' | 'invoice' | 'credit_note' | 'order' | 'gift_card';
    year: number;
    prefix: string;
    pad?: number;
  }): Promise<{ value: bigint; formatted: string }> {
    const pad = args.pad ?? 6;
    // INSERT ... ON CONFLICT pour garantir la présence de la ligne,
    // puis UPDATE atomique pour réserver la valeur suivante.
    await this.client.query(
      `INSERT INTO document_sequences (organization_id, kind, year, next_value)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (organization_id, kind, year) DO NOTHING`,
      [args.organizationId, args.kind, args.year],
    );
    const res = await this.client.query<{ next_value: string }>(
      `UPDATE document_sequences
          SET next_value = next_value + 1
        WHERE organization_id = $1 AND kind = $2 AND year = $3
       RETURNING next_value - 1 AS next_value`,
      [args.organizationId, args.kind, args.year],
    );
    if (res.rowCount === 0) throw new Error('SEQUENCE_RESERVATION_FAILED');
    const value = BigInt(res.rows[0]!.next_value);
    const formatted = `${args.prefix}-${args.year}-${value
      .toString()
      .padStart(pad, '0')}`;
    return { value, formatted };
  }

  /** Vérification d'intégrité de la chaîne sur une plage. */
  async verifyChain(
    organizationId: string,
    opts: { from?: number; to?: number } = {},
  ): Promise<{
    ok: boolean;
    inspected: number;
    firstError?: { index: string; reason: string };
  }> {
    const { rows } = await this.client.query<{
      immutable_index: string;
      event_type: string;
      payload: unknown;
      previous_hash: string;
      current_hash: string;
    }>(
      `SELECT immutable_index, event_type, payload, previous_hash, current_hash
       FROM fiscal_events
       WHERE organization_id = $1
         AND ($2::bigint IS NULL OR immutable_index >= $2)
         AND ($3::bigint IS NULL OR immutable_index <= $3)
       ORDER BY immutable_index ASC`,
      [organizationId, opts.from ?? null, opts.to ?? null],
    );

    let expectedPrev = GENESIS_HASH;
    let expectedIndex: bigint | null = null;

    for (const row of rows) {
      const idx = BigInt(row.immutable_index);
      if (expectedIndex !== null && idx !== expectedIndex + 1n) {
        return {
          ok: false,
          inspected: rows.length,
          firstError: { index: idx.toString(), reason: 'INDEX_GAP' },
        };
      }
      // Pour la 1ère ligne on accepte n'importe quel previous (rejouable par sous-plage)
      if (expectedIndex !== null && row.previous_hash !== expectedPrev) {
        return {
          ok: false,
          inspected: rows.length,
          firstError: { index: idx.toString(), reason: 'PREVIOUS_HASH_MISMATCH' },
        };
      }
      const recomputed = computeEventHash({
        previousHash: row.previous_hash,
        immutableIndex: idx,
        eventType: row.event_type as FiscalEventType,
        payload: row.payload,
        signingKey: this.signingKey(),
      });
      if (recomputed !== row.current_hash) {
        return {
          ok: false,
          inspected: rows.length,
          firstError: { index: idx.toString(), reason: 'CURRENT_HASH_MISMATCH' },
        };
      }
      expectedPrev = row.current_hash;
      expectedIndex = idx;
    }

    return { ok: true, inspected: rows.length };
  }
}
