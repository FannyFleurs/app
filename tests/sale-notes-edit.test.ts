// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * Commentaire d'une vente (ex. numéro de dossier OGF transmis à la commande)
 * modifiable même APRÈS validation — y compris sur une vente déjà ancienne,
 * pour corriger un commentaire manquant ou erroné a posteriori.
 *
 * notes n'est pas un champ fiscal gelé par fn_protect_validated_sale (seuls
 * les totaux, le numéro de ticket, le hash et la date de validation le
 * sont) : une vente déjà scellée reste donc modifiable sur ce point.
 *
 * Intégration contre une VRAIE base Postgres.
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { PATCH: patchNotes } = await import('@/app/api/sales/[id]/notes/route');

describe.skipIf(!hasDb)('Commentaire d\'une vente — modifiable après validation', () => {
  let organizationId: string;
  let storeId: string;
  let registerId: string;
  let userId: string;
  let saleId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Sale Notes ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'SN', 'Sale Notes') RETURNING id`,
      [organizationId],
    );
    storeId = store.rows[0]!.id;
    const register = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R1', 'Caisse') RETURNING id`,
      [organizationId, storeId],
    );
    registerId = register.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `sn-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };

    // Vente déjà VALIDÉE, scellée fiscalement comme en production (il y a
    // quelques jours — "une commande passée").
    const sale = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, status,
         validated_at, total_ht, total_ttc, receipt_number, fiscal_hash)
       VALUES ($1, $2, $3, $4, 'validated', now() - interval '3 days', 100, 100, 'T-0001', 'hash-fixture')
       RETURNING id`,
      [organizationId, storeId, registerId, userId],
    );
    saleId = sale.rows[0]!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  function patch(id: string, notes: string) {
    return patchNotes(
      new Request('https://x.test', { method: 'PATCH', body: JSON.stringify({ notes }) }),
      { params: { id } },
    );
  }

  it("ajoute un commentaire absent à l'origine sur une vente déjà validée (ancienne)", async () => {
    const before = await query<{ notes: string | null }>(`SELECT notes FROM sales WHERE id = $1`, [saleId]);
    expect(before.rows[0]!.notes).toBeNull();

    const res = await patch(saleId, 'Dossier n° 48213 — Mme Durand');
    expect(res.status).toBe(200);

    const after = await query<{ notes: string | null }>(`SELECT notes FROM sales WHERE id = $1`, [saleId]);
    expect(after.rows[0]!.notes).toBe('Dossier n° 48213 — Mme Durand');

    // Les champs fiscaux, eux, restent intacts (trigger fn_protect_validated_sale).
    const fiscal = await query<{ total_ttc: string; receipt_number: string }>(
      `SELECT total_ttc::text, receipt_number FROM sales WHERE id = $1`, [saleId],
    );
    expect(Number(fiscal.rows[0]!.total_ttc)).toBe(100);
    expect(fiscal.rows[0]!.receipt_number).toBe('T-0001');
  });

  it('remplace un commentaire existant', async () => {
    await patch(saleId, 'Premier commentaire');
    const res = await patch(saleId, 'Commentaire corrigé');
    expect(res.status).toBe(200);
    const row = await query<{ notes: string }>(`SELECT notes FROM sales WHERE id = $1`, [saleId]);
    expect(row.rows[0]!.notes).toBe('Commentaire corrigé');
  });

  it('une chaîne vide efface le commentaire (NULL, pas une chaîne vide)', async () => {
    await patch(saleId, 'À effacer');
    const res = await patch(saleId, '   ');
    expect(res.status).toBe(200);
    const row = await query<{ notes: string | null }>(`SELECT notes FROM sales WHERE id = $1`, [saleId]);
    expect(row.rows[0]!.notes).toBeNull();
  });

  it('une vente introuvable (autre organisation) est rejetée', async () => {
    const res = await patch(randomUUID(), 'x');
    expect(res.status).toBe(404);
  });
});
