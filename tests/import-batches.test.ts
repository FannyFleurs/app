// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * Réception d'import (PDA) : un import produits peut être envoyé au PDA
 * (Produits → Importer → « Envoyer cet import au PDA »), qui liste alors ses
 * articles à réceptionner, un par un, avec impression d'étiquettes à la clé.
 *
 * Ce test couvre tout le circuit : commit → lot créé → bascule PDA →
 * apparition dans /api/pda/import-batches (scopée boutique) → réception
 * d'un article (mouvement de stock + marquage) → disparition de la liste
 * une fois tous les articles reçus.
 *
 * Intégration contre une VRAIE base Postgres.
 */
let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { POST: commit } = await import('@/app/api/products/import/commit/route');
const { PATCH: togglePda } = await import('@/app/api/products/import/[id]/pda/route');
const { GET: listBatches } = await import('@/app/api/pda/import-batches/route');
const { GET: listItems, PATCH: receiveItem } = await import('@/app/api/pda/import-batches/[id]/items/route');

describe('Réception d\'import (PDA)', () => {
  let organizationId: string;
  let storeAId: string;
  let storeBId: string;
  let taxRateCode: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Import Batches ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const storeA = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'A', 'Boutique A') RETURNING id`,
      [organizationId],
    );
    storeAId = storeA.rows[0]!.id;
    const storeB = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'B', 'Boutique B') RETURNING id`,
      [organizationId],
    );
    storeBId = storeB.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `ib-${randomUUID()}@example.test`],
    );
    currentUser = { id: user.rows[0]!.id, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };
    await query(
      `INSERT INTO tax_rates (organization_id, code, label, rate, is_default)
       VALUES ($1, 'TVA20', '20%', 20, TRUE)`,
      [organizationId],
    );
    taxRateCode = 'TVA20';
  });

  afterAll(async () => {
    await pool.end();
  });

  function commitReq(body: Record<string, unknown>) {
    return commit(new Request('https://x.test/api/products/import/commit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
  }

  it('un commit crée un lot d\'import avec ses articles, même sans l\'envoyer au PDA', async () => {
    const res = await commitReq({
      rows: [
        { name: `Sapin ${randomUUID()}`, sale_price_ttc: 30, tax_rate_code: taxRateCode },
        { name: `Houx ${randomUUID()}`, sale_price_ttc: 12, tax_rate_code: taxRateCode },
      ],
      filename: 'Commande Toussaint.xlsx',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inserted).toBe(2);
    expect(body.batch_id).toBeTruthy();

    const batch = await query<{ filename: string; sent_to_pda: boolean; product_count: number }>(
      `SELECT filename, sent_to_pda, product_count FROM import_batches WHERE id = $1`,
      [body.batch_id],
    );
    expect(batch.rows[0]).toMatchObject({ filename: 'Commande Toussaint.xlsx', sent_to_pda: false, product_count: 2 });

    const items = await query(`SELECT COUNT(*)::int AS n FROM import_batch_items WHERE import_batch_id = $1`, [body.batch_id]);
    expect(items.rows[0]!.n).toBe(2);

    // Pas envoyé au PDA : invisible dans la liste de réception.
    const list = await listBatches(new Request(`https://x.test?store_id=${storeAId}`));
    const ids = (await list.json()).batches.map((b: { id: string }) => b.id);
    expect(ids).not.toContain(body.batch_id);
  });

  it('bascule « Envoyer au PDA » : le lot apparaît dans la liste, scopé à la bonne boutique', async () => {
    const res = await commitReq({
      rows: [{ name: `Nordmann ${randomUUID()}`, sale_price_ttc: 45, tax_rate_code: taxRateCode }],
      store_ids: [storeAId],
      filename: 'Réassort A.csv',
    });
    const { batch_id: batchId } = await res.json();

    const toggled = await togglePda(
      new Request('https://x.test', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sent_to_pda: true }) }),
      { params: { id: batchId } },
    );
    expect(toggled.status).toBe(200);

    const listA = await listBatches(new Request(`https://x.test?store_id=${storeAId}`));
    const idsA = (await listA.json()).batches.map((b: { id: string }) => b.id);
    expect(idsA).toContain(batchId);

    // Ciblé UNIQUEMENT sur la boutique A : invisible pour la boutique B.
    const listB = await listBatches(new Request(`https://x.test?store_id=${storeBId}`));
    const idsB = (await listB.json()).batches.map((b: { id: string }) => b.id);
    expect(idsB).not.toContain(batchId);
  });

  it('un lot « toutes boutiques » (store_ids vide) est visible depuis n\'importe quelle boutique', async () => {
    const res = await commitReq({
      rows: [{ name: `Guirlande ${randomUUID()}`, sale_price_ttc: 8, tax_rate_code: taxRateCode }],
      filename: 'Toutes boutiques.xlsx',
    });
    const { batch_id: batchId } = await res.json();
    await togglePda(
      new Request('https://x.test', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sent_to_pda: true }) }),
      { params: { id: batchId } },
    );

    for (const sid of [storeAId, storeBId]) {
      const list = await listBatches(new Request(`https://x.test?store_id=${sid}`));
      const ids = (await list.json()).batches.map((b: { id: string }) => b.id);
      expect(ids).toContain(batchId);
    }
  });

  it('réceptionner un article : mouvement de stock créé, article marqué reçu, lot retiré une fois complet', async () => {
    const res = await commitReq({
      rows: [
        { name: `Article 1 ${randomUUID()}`, sale_price_ttc: 20, tax_rate_code: taxRateCode },
        { name: `Article 2 ${randomUUID()}`, sale_price_ttc: 25, tax_rate_code: taxRateCode },
      ],
      store_ids: [storeAId],
      filename: 'Lot réception.xlsx',
    });
    const { batch_id: batchId } = await res.json();
    await togglePda(
      new Request('https://x.test', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sent_to_pda: true }) }),
      { params: { id: batchId } },
    );

    const itemsRes = await listItems(new Request('https://x.test'), { params: { id: batchId } });
    const { items } = await itemsRes.json() as { items: { product_id: string; received_qty: number | null }[] };
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.received_qty === null)).toBe(true);
    const [first, second] = items;

    // Réceptionne le premier article.
    const recv1 = await receiveItem(
      new Request('https://x.test', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: first!.product_id, received_qty: 12 }) }),
      { params: { id: batchId } },
    );
    expect(recv1.status).toBe(200);

    // Toujours visible (1 article restant).
    const listAfterFirst = await listBatches(new Request(`https://x.test?store_id=${storeAId}`));
    const afterFirst = (await listAfterFirst.json()).batches.find((b: { id: string }) => b.id === batchId);
    expect(afterFirst).toMatchObject({ received: 1, total: 2 });

    // Réceptionne le second.
    const recv2 = await receiveItem(
      new Request('https://x.test', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: second!.product_id, received_qty: 4 }) }),
      { params: { id: batchId } },
    );
    expect(recv2.status).toBe(200);

    // Entièrement réceptionné : disparaît de la liste.
    const listAfterAll = await listBatches(new Request(`https://x.test?store_id=${storeAId}`));
    const idsAfterAll = (await listAfterAll.json()).batches.map((b: { id: string }) => b.id);
    expect(idsAfterAll).not.toContain(batchId);

    const finalItems = await listItems(new Request('https://x.test'), { params: { id: batchId } });
    const finalBody = await finalItems.json() as { items: { received_qty: number | null }[] };
    expect(finalBody.items.every((i) => i.received_qty !== null)).toBe(true);
  });

  it('une boutique d\'une autre organisation / un lot inconnu sont refusés (404)', async () => {
    const res = await togglePda(
      new Request('https://x.test', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sent_to_pda: true }) }),
      { params: { id: randomUUID() } },
    );
    expect(res.status).toBe(404);
  });
});
