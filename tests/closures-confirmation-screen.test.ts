// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { computeClosurePreview } from '@/lib/services/closure-preview';

/**
 * Écran de confirmation de clôture (ClosuresAdmin.tsx, vue `preview.sealed`) :
 *  - illustration réduite de 60 % (176px → 70px) ;
 *  - nombre de transactions CB affiché à côté du montant carte ;
 *  - ligne « Prélèvement », même libellé que sur le ticket Z imprimé
 *    (z-report-pdf.ts).
 */
describe('Écran de confirmation de clôture', () => {
  const admin = readFileSync('app/(app)/closures/ClosuresAdmin.tsx', 'utf8');

  it('illustration réduite de 60 % (w-44 → w-[70px])', () => {
    expect(admin).not.toMatch(/src="\/projet\/caisse-cloturee\.png"[\s\S]{0,80}w-44/);
    expect(admin).toMatch(/src="\/projet\/caisse-cloturee\.png"[\s\S]{0,80}w-\[70px\]/);
  });

  it('le montant carte affiche le nombre de transactions CB', () => {
    expect(admin).toMatch(/\$\{formatEUR\(cardTotal\)\} \(\$\{cardCount\} CB\)/);
    expect(admin).toMatch(/const cardCount = cardPayment\?\.count \?\? 0/);
  });

  it('une ligne « Prélèvement » est présente, basée sur cash_breakdown.bank_deposits', () => {
    expect(admin).toMatch(/label: 'Prélèvement', value: formatEUR\(preview\.cash_breakdown\.bank_deposits\)/);
  });
});

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('computeClosurePreview — nombre de transactions par mode de règlement', () => {
  let organizationId: string;
  let storeId: string;
  let registerId: string;
  let userId: string;
  const DAY = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Closure Confirmation ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'A', 'Boutique A') RETURNING id`,
      [organizationId],
    );
    storeId = store.rows[0]!.id;
    const register = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1,$2,'R1','Caisse') RETURNING id`,
      [organizationId, storeId],
    );
    registerId = register.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `cc-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
  });

  afterAll(async () => { await pool.end(); });

  async function makeCardSale(amount: number): Promise<void> {
    const sale = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, status,
         total_ht, total_tva, total_ttc, tva_breakdown, validated_at)
       VALUES ($1,$2,$3,$4,'validated', $5, 0, $5, '[]'::jsonb, now()) RETURNING id`,
      [organizationId, storeId, registerId, userId, amount],
    );
    await query(
      `INSERT INTO payments (organization_id, sale_id, method, amount) VALUES ($1,$2,'card',$3)`,
      [organizationId, sale.rows[0]!.id, amount],
    );
  }

  it('3 ventes CB du jour → count=3 pour la méthode card', async () => {
    await makeCardSale(10);
    await makeCardSale(25);
    await makeCardSale(7);

    const preview = await computeClosurePreview(storeId, DAY);
    const card = preview.payments.find((p) => p.method === 'card');
    expect(card).toMatchObject({ total: 42, count: 3 });
  });
});
