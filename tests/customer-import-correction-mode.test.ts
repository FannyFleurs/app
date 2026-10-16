// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { query, pool } from '@/lib/db/client';
import { CUSTOMER_IMPORT_COLUMNS } from '@/lib/customers/import-columns';

/**
 * Export clients + réimport en « mode correction ».
 *
 * Suite à une correction de points fidélité ratée (mauvaise colonne source),
 * le besoin exprimé : exporter les clients, corriger les cellules
 * nécessaires dans Excel, réimporter en n'appliquant QUE ce qui diffère —
 * sans dupliquer les fiches sans email ni téléphone (rapprochement par
 * Code fidélité, le plus fiable), et sans que les colonnes Points
 * fidélité / Solde dû s'additionnent au lieu de remplacer.
 *
 * Intégration contre une vraie base Postgres, comme customer-import-balance.test.ts.
 */
let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { POST: importPost } = await import('@/app/api/customers/import/route');
const { GET: exportGet } = await import('@/app/api/customers/export/route');

async function makeXlsx(rows: Record<string, string | number>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Clients');
  ws.columns = CUSTOMER_IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key }));
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function importRequest(buf: Buffer, storeIds: string[], correctionMode = false): Request {
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'clients.xlsx');
  fd.append('store_ids', JSON.stringify(storeIds));
  if (correctionMode) fd.append('correction_mode', 'true');
  return new Request('https://x.test', { method: 'POST', body: fd });
}

describe('Import clients — rapprochement par code fidélité et mode correction', () => {
  let organizationId: string;
  let storeId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Correction Mode ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'CM', 'Correction Mode') RETURNING id`,
      [organizationId],
    );
    storeId = store.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `cm-${randomUUID()}@example.test`],
    );
    currentUser = { id: user.rows[0]!.id, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };
    await query(
      `INSERT INTO settings (organization_id, key, value) VALUES ($1, 'pos_ui', $2::jsonb)`,
      [organizationId, JSON.stringify({ loyalty: { euros_earned: 1, per_euros_spent: 1 } })],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  async function stateByCode(code: string): Promise<{ points: number; balance: number } | null> {
    const r = await query<{ points: string; balance: string }>(
      `SELECT COALESCE((SELECT SUM(points_balance) FROM loyalty_accounts WHERE customer_id = c.id), 0)::text AS points,
              c.account_balance::text AS balance
         FROM customers c WHERE c.organization_id = $1 AND c.loyalty_code = $2`,
      [organizationId, code],
    );
    if (!r.rows[0]) return null;
    return { points: Number(r.rows[0].points), balance: Number(r.rows[0].balance) };
  }

  it('retrouve une fiche SANS email ni téléphone par son Code fidélité (pas de doublon)', async () => {
    await importPost(importRequest(
      await makeXlsx([{ type: 'particulier', first_name: 'Launay', last_name: '', loyalty_code: 'OLD-1788' }]),
      [storeId],
    ));
    const before = await query<{ n: string }>(
      `SELECT COUNT(*)::text n FROM customers WHERE organization_id = $1 AND loyalty_code = 'OLD-1788'`,
      [organizationId],
    );
    expect(before.rows[0]!.n).toBe('1');

    // Réimport : même code, mais nom légèrement différent (ex. nettoyage orthographique) —
    // sans email/téléphone, seul le code fidélité permet d'éviter un doublon.
    await importPost(importRequest(
      await makeXlsx([{ type: 'particulier', first_name: 'launay', last_name: '', loyalty_code: 'OLD-1788' }]),
      [storeId],
    ));
    const after = await query<{ n: string }>(
      `SELECT COUNT(*)::text n FROM customers WHERE organization_id = $1 AND loyalty_code = 'OLD-1788'`,
      [organizationId],
    );
    expect(after.rows[0]!.n).toBe('1'); // toujours une seule fiche, pas de doublon
  });

  it('mode correction : les points deviennent la cible, seul l\'écart est appliqué (cellule inchangée = aucune écriture)', async () => {
    await importPost(importRequest(
      await makeXlsx([{ type: 'particulier', first_name: 'Fanny', last_name: 'Aguinet', loyalty_code: 'OLD-2622', loyalty_points: 999 }]),
      [storeId],
    ));
    expect((await stateByCode('OLD-2622'))?.points).toBe(999); // import classique : ajouté tel quel (solde parti de 0)

    // Mode correction : remet la cible à 53.68 (la vraie valeur) — pas 999+53.68.
    const corr1 = await importPost(importRequest(
      await makeXlsx([{ type: 'particulier', first_name: 'Fanny', last_name: 'Aguinet', loyalty_code: 'OLD-2622', loyalty_points: 53.68 }]),
      [storeId], true,
    ));
    expect((await corr1.json()).loyalty_updated).toBe(1);
    expect((await stateByCode('OLD-2622'))?.points).toBe(53.68);

    // Réimporter EXACTEMENT le même fichier corrigé ne doit plus rien changer.
    const corr2 = await importPost(importRequest(
      await makeXlsx([{ type: 'particulier', first_name: 'Fanny', last_name: 'Aguinet', loyalty_code: 'OLD-2622', loyalty_points: 53.68 }]),
      [storeId], true,
    ));
    expect((await corr2.json()).loyalty_updated).toBe(0); // no-op : cellule inchangée
    expect((await stateByCode('OLD-2622'))?.points).toBe(53.68);
  });

  it('mode correction : le solde dû devient aussi la cible (pas un ajout)', async () => {
    await importPost(importRequest(
      await makeXlsx([{ type: 'particulier', first_name: 'Marc', last_name: 'Petit', loyalty_code: 'OLD-999', balance_due: 100 }]),
      [storeId],
    ));
    expect((await stateByCode('OLD-999'))?.balance).toBe(-100);

    await importPost(importRequest(
      await makeXlsx([{ type: 'particulier', first_name: 'Marc', last_name: 'Petit', loyalty_code: 'OLD-999', balance_due: 40 }]),
      [storeId], true,
    ));
    expect((await stateByCode('OLD-999'))?.balance).toBe(-40); // cible exacte, pas -100-40
  });

  it('sans mode correction (défaut) : comportement additif inchangé', async () => {
    await importPost(importRequest(
      await makeXlsx([{ type: 'particulier', first_name: 'Eva', last_name: 'Roy', loyalty_code: 'OLD-555', loyalty_points: 10 }]),
      [storeId],
    ));
    await importPost(importRequest(
      await makeXlsx([{ type: 'particulier', first_name: 'Eva', last_name: 'Roy', loyalty_code: 'OLD-555', loyalty_points: 5 }]),
      [storeId],
    ));
    expect((await stateByCode('OLD-555'))?.points).toBe(15); // additif : 10 + 5
  });

  it('export : fichier au format du modèle, réimportable (round-trip)', async () => {
    const res = await exportGet();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('spreadsheetml');
    const buf = Buffer.from(await res.arrayBuffer());

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet('Clients')!;
    const header = (ws.getRow(1).values as unknown[]).slice(1).map((v) => String(v));
    expect(header).toEqual(CUSTOMER_IMPORT_COLUMNS.map((c) => c.header));
    expect(wb.getWorksheet('Instructions')).toBeTruthy();

    // La fiche "Fanny Aguinet" corrigée plus haut (53,68 points) doit apparaître.
    let found = false;
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      if (row.getCell(15).value === 'OLD-2622') { // "Code fidélité" = 15e colonne
        found = true;
        expect(Number(row.getCell(16).value)).toBe(53.68); // "Points fidélité"
      }
    }
    expect(found).toBe(true);
  });
});
