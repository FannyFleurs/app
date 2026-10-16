// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { query, pool } from '@/lib/db/client';
import { CUSTOMER_IMPORT_COLUMNS } from '@/lib/customers/import-columns';

/**
 * Correction en masse d'un import de points de fidélité fait avec la
 * mauvaise colonne (import/loyalty-batches + import/loyalty-revert).
 *
 * L'import crédite les points en les AJOUTANT au solde existant (jamais en
 * remplacement, voir app/api/customers/import/route.ts) — ré-importer le bon
 * fichier par-dessus un mauvais import double donc l'erreur au lieu de la
 * corriger. Chaque ligne créditée est tracée dans loyalty_movements
 * (source_type='import') : loyalty-batches regroupe ces mouvements en lots
 * par proximité temporelle, loyalty-revert annule précisément un lot choisi
 * (mouvement compensatoire 'cancel', jamais une remise à zéro) sans toucher
 * à l'activité fidélité normale (ventes) sur les mêmes comptes.
 *
 * Intégration contre une vraie base Postgres, comme customer-import-balance.test.ts.
 */
let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { POST: importPost } = await import('@/app/api/customers/import/route');
const { GET: batchesGet } = await import('@/app/api/customers/import/loyalty-batches/route');
const { POST: revertPost } = await import('@/app/api/customers/import/loyalty-revert/route');

async function makeXlsx(rows: Record<string, string | number>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Clients');
  ws.columns = CUSTOMER_IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key }));
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function importRequest(buf: Buffer, storeIds: string[]): Request {
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'clients.xlsx');
  fd.append('store_ids', JSON.stringify(storeIds));
  return new Request('https://x.test', { method: 'POST', body: fd });
}

describe('Correction en masse — import fidélité (loyalty-batches / loyalty-revert)', () => {
  let organizationId: string;
  let storeId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Loyalty Revert ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'LR', 'Loyalty Revert') RETURNING id`,
      [organizationId],
    );
    storeId = store.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `lr-${randomUUID()}@example.test`],
    );
    currentUser = { id: user.rows[0]!.id, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };

    // Taux fidélité 1:1 (1 point par € déclaré) pour que la colonne
    // "Points fidélité" du fichier d'import se retrouve telle quelle en
    // points — par défaut le taux est 0.05 (1 point / 20 € dépensés), ce qui
    // rendrait les assertions illisibles.
    await query(
      `INSERT INTO settings (organization_id, key, value) VALUES ($1, 'pos_ui', $2::jsonb)`,
      [organizationId, JSON.stringify({ loyalty: { euros_earned: 1, per_euros_spent: 1 } })],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  async function pointsOf(email: string): Promise<number> {
    const r = await query<{ points_balance: string }>(
      `SELECT la.points_balance::text FROM loyalty_accounts la
         JOIN customers c ON c.id = la.customer_id
        WHERE c.organization_id = $1 AND c.email = $2`,
      [organizationId, email],
    );
    return Number(r.rows[0]?.points_balance ?? 0);
  }

  it("annule exactement les points d'un mauvais import, sans toucher un compte déjà crédité avant l'import", async () => {
    // Un client a déjà 10 points légitimes (vente antérieure, PAS un import)
    // avant l'import raté — isole bien « activité normale » de « import ».
    const cust = await query<{ id: string }>(
      `INSERT INTO customers (organization_id, type, first_name, last_name, email)
       VALUES ($1, 'particulier', 'Jean', 'Martin', 'jean@ex.test') RETURNING id`,
      [organizationId],
    );
    const acc = await query<{ id: string }>(
      `INSERT INTO loyalty_accounts (organization_id, customer_id, points_balance, group_key)
       VALUES ($1, $2, 10, '*') RETURNING id`,
      [organizationId, cust.rows[0]!.id],
    );
    await query(
      `INSERT INTO loyalty_movements (organization_id, account_id, movement_type, points_delta, balance_after, reason, source_type)
       VALUES ($1, $2, 'earn', 10, 10, 'Vente', 'sale')`,
      [organizationId, acc.rows[0]!.id],
    );
    expect(await pointsOf('jean@ex.test')).toBe(10);

    // Import raté : mauvaise colonne -> 999 points ajoutés en trop.
    const bad = await importPost(importRequest(
      await makeXlsx([
        { type: 'particulier', first_name: 'Jean', last_name: 'Martin', email: 'jean@ex.test', loyalty_points: 999 },
        { type: 'particulier', first_name: 'Alice', last_name: 'Durand', email: 'alice@ex.test', loyalty_points: 500 },
      ]),
      [storeId],
    ));
    expect(bad.status).toBe(200);
    expect(await pointsOf('jean@ex.test')).toBe(1009);
    expect(await pointsOf('alice@ex.test')).toBe(500);

    const batchesRes = await batchesGet();
    const { batches } = await batchesRes.json() as { batches: { started_at: string; ended_at: string; count: number; total_points: number }[] };
    expect(batches.length).toBeGreaterThan(0);
    const lastBatch = batches[0]!; // plus récent d'abord
    expect(lastBatch.count).toBe(2);
    expect(lastBatch.total_points).toBe(1499); // 999 + 500

    const revertRes = await revertPost(new Request('https://x.test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ started_at: lastBatch.started_at, ended_at: lastBatch.ended_at }),
    }));
    expect(revertRes.status).toBe(200);
    const revertBody = await revertRes.json() as { reverted_count: number; total_points_reverted: number };
    expect(revertBody).toMatchObject({ reverted_count: 2, total_points_reverted: 1499 });

    // Jean retrouve son solde légitime d'avant le mauvais import (10), pas 0.
    expect(await pointsOf('jean@ex.test')).toBe(10);
    expect(await pointsOf('alice@ex.test')).toBe(0);
  });

  it('idempotent : rejouer la même annulation ne retire rien de plus', async () => {
    const buf = await makeXlsx([{ type: 'particulier', first_name: 'Marc', last_name: 'Petit', email: 'marc@ex.test', loyalty_points: 42 }]);
    await importPost(importRequest(buf, [storeId]));
    expect(await pointsOf('marc@ex.test')).toBe(42);

    const { batches } = await (await batchesGet()).json() as { batches: { started_at: string; ended_at: string }[] };
    const batch = batches[0]!;
    const body = JSON.stringify({ started_at: batch.started_at, ended_at: batch.ended_at });

    const first = await revertPost(new Request('https://x.test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }));
    expect(first.status).toBe(200);
    expect(await pointsOf('marc@ex.test')).toBe(0);

    // Deuxième appel sur le même lot : plus rien à annuler.
    const second = await revertPost(new Request('https://x.test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }));
    expect(second.status).toBe(404);
    expect(await pointsOf('marc@ex.test')).toBe(0);
  });

  it("un lot annulé disparaît de la liste des lots", async () => {
    const buf = await makeXlsx([{ type: 'particulier', first_name: 'Sophie', last_name: 'Caron', email: 'sophie@ex.test', loyalty_points: 7 }]);
    await importPost(importRequest(buf, [storeId]));
    const before = await (await batchesGet()).json() as { batches: { started_at: string; ended_at: string }[] };
    const batch = before.batches[0]!;
    await revertPost(new Request('https://x.test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ started_at: batch.started_at, ended_at: batch.ended_at }),
    }));
    const after = await (await batchesGet()).json() as { batches: { started_at: string; ended_at: string }[] };
    expect(after.batches.some((b) => b.started_at === batch.started_at && b.ended_at === batch.ended_at)).toBe(false);
  });

  it('un réimport après annulation cumule correctement sur le solde corrigé', async () => {
    const buf = await makeXlsx([{ type: 'particulier', first_name: 'Eva', last_name: 'Roy', email: 'eva@ex.test', loyalty_points: 300 }]);
    await importPost(importRequest(buf, [storeId]));
    expect(await pointsOf('eva@ex.test')).toBe(300);

    const { batches } = await (await batchesGet()).json() as { batches: { started_at: string; ended_at: string }[] };
    const batch = batches[0]!;
    await revertPost(new Request('https://x.test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ started_at: batch.started_at, ended_at: batch.ended_at }),
    }));
    expect(await pointsOf('eva@ex.test')).toBe(0);

    // Réimport avec la bonne valeur (25 au lieu de 300).
    const fixed = await makeXlsx([{ type: 'particulier', first_name: 'Eva', last_name: 'Roy', email: 'eva@ex.test', loyalty_points: 25 }]);
    await importPost(importRequest(fixed, [storeId]));
    expect(await pointsOf('eva@ex.test')).toBe(25);
  });
});
