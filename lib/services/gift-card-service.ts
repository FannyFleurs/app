import { withTransaction, query } from '@/lib/db/client';
import { generateEan13 } from './ean';

/**
 * Service carte cadeau.
 * Code : EAN-13 avec préfixe interne 29 (réservé in-store). Scannable.
 * Tous les mouvements sont append-only (gift_card_movements).
 */
export class GiftCardService {
  static async create(args: {
    organizationId: string;
    userId: string;
    amount: number;
    expiresAt?: string | null;
    buyer?: { id?: string | null; name?: string; phone?: string; email?: string };
    beneficiaryId?: string | null;
  }): Promise<{ id: string; code: string }> {
    if (args.amount <= 0) throw new Error('AMOUNT_REQUIRED');
    return withTransaction(async (client) => {
      // Génère un code unique
      let code = '';
      for (let i = 0; i < 5; i++) {
        const candidate = generateEan13('29');
        const exists = await client.query(
          `SELECT 1 FROM gift_cards WHERE code = $1`,
          [candidate],
        );
        if (exists.rowCount === 0) { code = candidate; break; }
      }
      if (!code) throw new Error('CODE_GENERATION_FAILED');

      // Détection runtime : colonnes acheteur présentes ? (la migration 0006 a-t-elle été appliquée ?)
      const colsRes = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'gift_cards' AND column_name IN ('buyer_name','buyer_phone','buyer_email')`,
      );
      const hasBuyerCols = colsRes.rowCount === 3;

      let ins;
      if (hasBuyerCols) {
        ins = await client.query<{ id: string }>(
          `INSERT INTO gift_cards
             (organization_id, code, initial_amount, balance,
              expires_at, buyer_id, beneficiary_id,
              buyer_name, buyer_phone, buyer_email, status)
           VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,'active')
           RETURNING id`,
          [
            args.organizationId, code, args.amount,
            args.expiresAt ?? null,
            args.buyer?.id ?? null,
            args.beneficiaryId ?? null,
            args.buyer?.name ?? null,
            args.buyer?.phone ?? null,
            args.buyer?.email ?? null,
          ],
        );
      } else {
        // Schéma initial — pas de coordonnées libres ; on accepte quand même la création.
        ins = await client.query<{ id: string }>(
          `INSERT INTO gift_cards
             (organization_id, code, initial_amount, balance,
              expires_at, buyer_id, beneficiary_id, status)
           VALUES ($1,$2,$3,$3,$4,$5,$6,'active')
           RETURNING id`,
          [
            args.organizationId, code, args.amount,
            args.expiresAt ?? null,
            args.buyer?.id ?? null,
            args.beneficiaryId ?? null,
          ],
        );
      }

      const gcId = ins.rows[0]!.id;
      await client.query(
        `INSERT INTO gift_card_movements
           (organization_id, gift_card_id, movement_type, amount_delta, balance_after, user_id)
         VALUES ($1,$2,'issue',$3,$3,$4)`,
        [args.organizationId, gcId, args.amount, args.userId],
      );

      return { id: gcId, code };
    });
  }

  /** Recherche un code (équivalent au scan). */
  static async lookup(organizationId: string, code: string) {
    const { rows } = await query<{
      id: string; code: string; balance: string; status: string;
      expires_at: string | null;
      buyer_name: string | null; buyer_phone: string | null;
      beneficiary_id: string | null;
    }>(
      `SELECT id, code, balance::text, status, expires_at,
              buyer_name, buyer_phone, beneficiary_id
         FROM gift_cards
        WHERE organization_id = $1 AND code = $2`,
      [organizationId, code.trim()],
    );
    return rows[0] ?? null;
  }

  /** Recherche libre (nom acheteur OU téléphone OU début de code). */
  static async search(organizationId: string, q: string, limit = 20) {
    const needle = `%${q.trim().toLowerCase()}%`;
    const { rows } = await query(
      `SELECT id, code, balance::text, status, expires_at,
              buyer_name, buyer_phone, initial_amount::text
         FROM gift_cards
        WHERE organization_id = $1
          AND (lower(coalesce(buyer_name,'')) LIKE $2
               OR coalesce(buyer_phone,'') LIKE $2
               OR code LIKE $2)
        ORDER BY issued_at DESC
        LIMIT $3`,
      [organizationId, needle, limit],
    );
    return rows;
  }
}
