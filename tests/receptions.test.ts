// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * Réceptions (PDA) : une réception peut venir d'un import de fichier
 * (Produits → Importer → « Envoyer cet import au PDA ») OU être créée
 * manuellement (Réceptions → Créer une réception), par simple sélection de
 * références déjà existantes. Dans les deux cas, même parcours PDA :
 * liste des réceptions envoyées → articles à réceptionner → mouvement de
 * stock + marquage reçu, avec capture possible du code-barres si l'article
 * n'en a pas encore.
 *
 * Intégration contre une VRAIE base Postgres.
 */
let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { POST: commit } = await import('@/app/api/products/import/commit/route');
const { GET: listReceptionsBo, POST: createReception } = await import('@/app/api/receptions/route');
const { GET: getReception, PATCH: patchReception } = await import('@/app/api/receptions/[id]/route');
const { GET: listReceptionsPda } = await import('@/app/api/pda/receptions/route');
const { GET: listItems, PATCH: receiveItem } = await import('@/app/api/pda/receptions/[id]/items/route');

describe('Réceptions (PDA)', () => {
  let organizationId: string;
  let storeAId: string;
  let storeBId: string;
  let taxRateCode: string;
  let taxRateId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Réceptions ${randomUUID()}`],
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
      [organizationId, `rc-${randomUUID()}@example.test`],
    );
    currentUser = { id: user.rows[0]!.id, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };
    const tax = await query<{ id: string }>(
      `INSERT INTO tax_rates (organization_id, code, label, rate, is_default)
       VALUES ($1, 'TVA20', '20%', 20, TRUE) RETURNING id`,
      [organizationId],
    );
    taxRateCode = 'TVA20';
    taxRateId = tax.rows[0]!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  function commitReq(body: Record<string, unknown>) {
    return commit(new Request('https://x.test/api/products/import/commit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
  }

  async function insertProduct(name: string, barcode: string | null = null) {
    const r = await query<{ id: string }>(
      `INSERT INTO products (organization_id, name, tax_rate_id, sale_price_ttc, barcode, created_by, updated_by)
       VALUES ($1, $2, $3, 10, $4, $5, $5) RETURNING id`,
      [organizationId, name, taxRateId, barcode, currentUser.id],
    );
    return r.rows[0]!.id;
  }

  it('un commit crée une réception avec ses articles, même sans l\'envoyer au PDA', async () => {
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
    expect(body.reception_id).toBeTruthy();

    const reception = await query<{ filename: string; sent_to_pda: boolean; product_count: number }>(
      `SELECT filename, sent_to_pda, product_count FROM receptions WHERE id = $1`,
      [body.reception_id],
    );
    expect(reception.rows[0]).toMatchObject({ filename: 'Commande Toussaint.xlsx', sent_to_pda: false, product_count: 2 });

    const items = await query(`SELECT COUNT(*)::int AS n FROM reception_items WHERE reception_id = $1`, [body.reception_id]);
    expect(items.rows[0]!.n).toBe(2);

    // Pas envoyé au PDA : invisible dans la liste de réception du PDA.
    const list = await listReceptionsPda(new Request(`https://x.test?store_id=${storeAId}`));
    const ids = (await list.json()).receptions.map((r: { id: string }) => r.id);
    expect(ids).not.toContain(body.reception_id);
  });

  it('bascule « Envoyer au PDA » : la réception apparaît dans la liste, scopée à la bonne boutique', async () => {
    const res = await commitReq({
      rows: [{ name: `Nordmann ${randomUUID()}`, sale_price_ttc: 45, tax_rate_code: taxRateCode }],
      store_ids: [storeAId],
      filename: 'Réassort A.csv',
    });
    const { reception_id: receptionId } = await res.json();

    const toggled = await patchReception(
      new Request('https://x.test', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sent_to_pda: true }) }),
      { params: { id: receptionId } },
    );
    expect(toggled.status).toBe(200);

    const listA = await listReceptionsPda(new Request(`https://x.test?store_id=${storeAId}`));
    const idsA = (await listA.json()).receptions.map((r: { id: string }) => r.id);
    expect(idsA).toContain(receptionId);

    // Ciblée UNIQUEMENT sur la boutique A : invisible pour la boutique B.
    const listB = await listReceptionsPda(new Request(`https://x.test?store_id=${storeBId}`));
    const idsB = (await listB.json()).receptions.map((r: { id: string }) => r.id);
    expect(idsB).not.toContain(receptionId);
  });

  it('réceptionner un article : mouvement de stock créé, article marqué reçu, réception retirée une fois complète', async () => {
    const res = await commitReq({
      rows: [
        { name: `Article 1 ${randomUUID()}`, sale_price_ttc: 20, tax_rate_code: taxRateCode },
        { name: `Article 2 ${randomUUID()}`, sale_price_ttc: 25, tax_rate_code: taxRateCode },
      ],
      store_ids: [storeAId],
      filename: 'Réception complète.xlsx',
    });
    const { reception_id: receptionId } = await res.json();
    await patchReception(
      new Request('https://x.test', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sent_to_pda: true }) }),
      { params: { id: receptionId } },
    );

    const itemsRes = await listItems(new Request('https://x.test'), { params: { id: receptionId } });
    const { items } = await itemsRes.json() as { items: { product_id: string; received_qty: number | null }[] };
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.received_qty === null)).toBe(true);
    const [first, second] = items;

    const recv1 = await receiveItem(
      new Request('https://x.test', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: first!.product_id, received_qty: 12 }) }),
      { params: { id: receptionId } },
    );
    expect(recv1.status).toBe(200);

    const listAfterFirst = await listReceptionsPda(new Request(`https://x.test?store_id=${storeAId}`));
    const afterFirst = (await listAfterFirst.json()).receptions.find((r: { id: string }) => r.id === receptionId);
    expect(afterFirst).toMatchObject({ received: 1, total: 2 });

    const recv2 = await receiveItem(
      new Request('https://x.test', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: second!.product_id, received_qty: 4 }) }),
      { params: { id: receptionId } },
    );
    expect(recv2.status).toBe(200);

    const listAfterAll = await listReceptionsPda(new Request(`https://x.test?store_id=${storeAId}`));
    const idsAfterAll = (await listAfterAll.json()).receptions.map((r: { id: string }) => r.id);
    expect(idsAfterAll).not.toContain(receptionId);
  });

  it('une réception inconnue est refusée (404)', async () => {
    const res = await patchReception(
      new Request('https://x.test', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sent_to_pda: true }) }),
      { params: { id: randomUUID() } },
    );
    expect(res.status).toBe(404);
  });

  it('création manuelle : envoyée au PDA immédiatement, visible dans la liste BO et PDA', async () => {
    const p1 = await insertProduct(`Rose ${randomUUID()}`);
    const p2 = await insertProduct(`Tulipe ${randomUUID()}`);

    const res = await createReception(new Request('https://x.test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_ids: [storeAId], product_ids: [p1, p2] }),
    }));
    expect(res.status).toBe(201);
    const { id: receptionId } = await res.json();

    const boList = await listReceptionsBo();
    const boRow = (await boList.json()).receptions.find((r: { id: string }) => r.id === receptionId);
    expect(boRow).toMatchObject({ filename: null, sent_to_pda: true, total: 2, received: 0, started: false });

    const pdaList = await listReceptionsPda(new Request(`https://x.test?store_id=${storeAId}`));
    const ids = (await pdaList.json()).receptions.map((r: { id: string }) => r.id);
    expect(ids).toContain(receptionId);
  });

  it('modification possible tant que non commencée, refusée (409) une fois un article reçu', async () => {
    const p1 = await insertProduct(`Lys ${randomUUID()}`);
    const p2 = await insertProduct(`Iris ${randomUUID()}`);
    const p3 = await insertProduct(`Pivoine ${randomUUID()}`);

    const res = await createReception(new Request('https://x.test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_ids: [p1, p2] }),
    }));
    const { id: receptionId } = await res.json();

    // Pas commencée : remplacement de la liste accepté.
    const edit = await patchReception(
      new Request('https://x.test', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_ids: [p1, p3] }) }),
      { params: { id: receptionId } },
    );
    expect(edit.status).toBe(200);
    const detail = await getReception(new Request('https://x.test'), { params: { id: receptionId } });
    const detailBody = await detail.json() as { items: { product_id: string }[] };
    expect(detailBody.items.map((i) => i.product_id).sort()).toEqual([p1, p3].sort());

    // Réceptionne p1 : la réception a commencé.
    await receiveItem(
      new Request('https://x.test', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: p1, received_qty: 1 }) }),
      { params: { id: receptionId } },
    );

    const editAfterStart = await patchReception(
      new Request('https://x.test', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_ids: [p2] }) }),
      { params: { id: receptionId } },
    );
    expect(editAfterStart.status).toBe(409);
    const errBody = await editAfterStart.json();
    expect(errBody.error).toBe('RECEPTION_STARTED');
  });

  it('réception d\'un article sans code-barres : le code saisi au PDA est appliqué au produit', async () => {
    const p1 = await insertProduct(`Orchidée ${randomUUID()}`, null);
    const res = await createReception(new Request('https://x.test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_ids: [p1] }),
    }));
    const { id: receptionId } = await res.json();

    const newCode = `34${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    const recv = await receiveItem(
      new Request('https://x.test', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: p1, received_qty: 1, barcode: newCode }) }),
      { params: { id: receptionId } },
    );
    expect(recv.status).toBe(200);

    const product = await query<{ barcode: string }>(`SELECT barcode FROM products WHERE id = $1`, [p1]);
    expect(product.rows[0]!.barcode).toBe(newCode);
  });

  it('refuse d\'écraser un code-barres déjà renseigné (409 BARCODE_ALREADY_SET)', async () => {
    const p1 = await insertProduct(`Jacinthe ${randomUUID()}`, 'existing-code-123');
    const res = await createReception(new Request('https://x.test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_ids: [p1] }),
    }));
    const { id: receptionId } = await res.json();

    const recv = await receiveItem(
      new Request('https://x.test', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: p1, received_qty: 1, barcode: 'autre-code' }) }),
      { params: { id: receptionId } },
    );
    expect(recv.status).toBe(409);
    expect((await recv.json()).error).toBe('BARCODE_ALREADY_SET');
  });

  it('refuse un code-barres déjà utilisé par un autre produit (409 BARCODE_ALREADY_USED)', async () => {
    const takenCode = `taken-${randomUUID()}`;
    await insertProduct(`Autre article ${randomUUID()}`, takenCode);
    const p1 = await insertProduct(`Freesia ${randomUUID()}`, null);
    const res = await createReception(new Request('https://x.test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_ids: [p1] }),
    }));
    const { id: receptionId } = await res.json();

    const recv = await receiveItem(
      new Request('https://x.test', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: p1, received_qty: 1, barcode: takenCode }) }),
      { params: { id: receptionId } },
    );
    expect(recv.status).toBe(409);
    expect((await recv.json()).error).toBe('BARCODE_ALREADY_USED');

    // Le code n'a pas été appliqué et l'article n'a PAS été marqué reçu.
    const product = await query<{ barcode: string | null }>(`SELECT barcode FROM products WHERE id = $1`, [p1]);
    expect(product.rows[0]!.barcode).toBeNull();
  });
});
