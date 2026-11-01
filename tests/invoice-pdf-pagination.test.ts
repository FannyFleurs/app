// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { formatEurPdf } from '@/lib/services/money';

/**
 * Bug remonté sur une vraie facture (F-2026-000039, multi-pages) :
 *
 * 1. Les montants ≥ 1 000 € affichaient un carré (tofu) entre le 1er et le
 *    2ᵉ chiffre du milliers — `formatEUR` sépare les milliers par une espace
 *    fine insécable (U+202F) et met une espace insécable (U+00A0) avant le
 *    symbole €, deux caractères absents de la police embarquée (Arimo) dans
 *    PDFKit. `formatEurPdf` les remplace par une espace normale.
 *
 * 2. Le pied de facture (Total HT/TVA/TOTAL TTC, conditions de règlement,
 *    RIB) se retrouvait éclaté : chaque élément isolé sur sa propre page,
 *    la plupart quasi vierges — aucune vérification de place disponible
 *    n'était faite avant de dessiner ce bloc. invoice-pdf.ts mesure
 *    désormais sa hauteur AVANT de rien dessiner (measureFooterHeight) et
 *    saute de page en UNE fois si besoin, pour garder le bloc groupé.
 */
describe('formatEurPdf — espaces insécables remplacées (plus de tofu PDFKit)', () => {
  it('remplace l\'espace fine insécable du séparateur de milliers (U+202F)', () => {
    const s = formatEurPdf(3142.18);
    expect(s).not.toMatch(/[  ]/);
    expect(s).toBe('3 142,18 €');
  });

  it('remplace aussi l\'espace insécable avant le symbole € (U+00A0)', () => {
    const s = formatEurPdf(17.45);
    expect(s).not.toMatch(/[  ]/);
    expect(s).toBe('17,45 €');
  });
});

describe('Les 4 générateurs PDF utilisent formatEurPdf (pas formatEUR) pour tout montant dessiné', () => {
  const files = [
    'lib/services/invoice-pdf.ts',
    'lib/services/credit-note-pdf.ts',
    'lib/services/gift-card-certificate-pdf.ts',
    'lib/services/gift-card-pdf.ts',
  ];
  for (const f of files) {
    it(`${f} importe formatEurPdf, plus aucun appel à formatEUR brut`, () => {
      const src = readFileSync(f, 'utf8');
      expect(src).toMatch(/import \{ formatEurPdf \} from '\.\/money';/);
      expect(src).not.toMatch(/\bformatEUR\(/);
    });
  }
});

describe('invoice-pdf.ts — pied de facture mesuré d\'un seul tenant avant tracé', () => {
  const src = readFileSync('lib/services/invoice-pdf.ts', 'utf8');

  it('measureFooterHeight existe et est appelée avant de dessiner le bloc', () => {
    expect(src).toMatch(/function measureFooterHeight\(\): number \{/);
    expect(src).toMatch(/const footerH = measureFooterHeight\(\);/);
    expect(src).toMatch(/if \(y \+ footerH > 720\) \{\s*doc\.addPage\(\);\s*y = 50;\s*\}/);
  });

  it('la mesure est faite AVANT le premier tracé du pied (drawHr des totaux)', () => {
    const measureIdx = src.indexOf('const footerH = measureFooterHeight();');
    const drawIdx = src.indexOf("drawHr(doc, y);\n    y += 12;\n\n    // Totaux");
    expect(measureIdx).toBeGreaterThan(-1);
    expect(drawIdx).toBeGreaterThan(-1);
    expect(measureIdx).toBeLessThan(drawIdx);
  });
});

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('Facture multi-pages avec RIB — pied groupé, PDF généré sans erreur', () => {
  it('une facture de 25 tickets (3500€, RIB configuré) génère un PDF valide', async () => {
    const { query, pool } = await import('@/lib/db/client');
    const { InvoiceService } = await import('@/lib/services/invoice-service');
    const { buildInvoicePdf } = await import('@/lib/services/pdf-builders');

    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name, siret, vat_number, capital_social, ape_code)
       VALUES ($1, 'SAS Test Pagination', '82085315800021', 'FR19820853158', '12500', '4776Z') RETURNING id`,
      [`Test Invoice Pdf Pagination ${randomUUID()}`],
    );
    const organizationId = org.rows[0]!.id;
    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'A', 'Boutique A') RETURNING id`,
      [organizationId],
    );
    const storeId = store.rows[0]!.id;
    const register = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1,$2,'R1','Caisse') RETURNING id`,
      [organizationId, storeId],
    );
    const registerId = register.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `invpdf-${randomUUID()}@example.test`],
    );
    const userId = user.rows[0]!.id;
    await query(
      `INSERT INTO tax_rates (organization_id, code, label, rate, is_default)
       VALUES ($1, 'TVA20', '20%', 20, TRUE)`,
      [organizationId],
    );
    const customer = await query<{ id: string }>(
      `INSERT INTO customers (organization_id, company_name, type) VALUES ($1,'Client Test','professionnel') RETURNING id`,
      [organizationId],
    );
    const customerId = customer.rows[0]!.id;
    await query(
      `INSERT INTO settings (organization_id, key, value) VALUES ($1, 'invoice', $2)`,
      [organizationId, JSON.stringify({
        show_bank_details: true, bank_holder: 'SAS Test Pagination', bank_name: 'Banque Test',
        bank_iban: 'FR7616606000018486022998597', bank_bic: 'AGRIFRPP866', default_payment_terms: 'net_45',
      })],
    );

    const saleIds: string[] = [];
    for (let i = 0; i < 25; i++) {
      const total = Number((50 + i * 7.5).toFixed(2));
      const ht = Number((total / 1.2).toFixed(4));
      const tva = Number((total - ht).toFixed(4));
      const sale = await query<{ id: string }>(
        `INSERT INTO sales (organization_id, store_id, register_id, user_id, customer_id, status,
           total_ht, total_tva, total_ttc, tva_breakdown, validated_at, receipt_number)
         VALUES ($1,$2,$3,$4,$5,'validated', $6, $7, $8, $9, now(), $10) RETURNING id`,
        [
          organizationId, storeId, registerId, userId, customerId, ht, tva, total,
          JSON.stringify([{ rate: 20, base_ht: ht, tva, ttc: total }]),
          `R-INVPDF-${String(i).padStart(3, '0')}`,
        ],
      );
      const saleId = sale.rows[0]!.id;
      await query(
        `INSERT INTO sale_lines (organization_id, sale_id, line_index, label, unit_price_ttc, quantity,
           discount_amount, tax_rate, tax_rate_code, line_ht, line_tva, line_ttc)
         VALUES ($1,$2,0,$3,$4,1,0,20,'TVA20',$5,$6,$4)`,
        [organizationId, saleId, `Composition florale ${i + 1}`, total, ht, tva],
      );
      saleIds.push(saleId);
    }

    const out = await InvoiceService.createFromAccountSales({ organizationId, userId, customerId, saleIds });
    expect(out.total_ttc).toBeCloseTo(3500, 2);

    const pdf = await buildInvoicePdf(out.invoice_id, organizationId);
    expect(pdf).not.toBeNull();
    // Heuristique : lit le nombre de pages déclaré dans l'arbre /Pages
    // (/Count N — toujours en clair, non compressé, contrairement aux flux
    // de contenu /FlateDecode où les espaces ne sont pas inspectables telles
    // quelles). S'assure que le document reste raisonnablement court (pied
    // groupé, pas une page par élément de pied comme avant le correctif —
    // qui aurait produit 7+ pages pour un pied de 5 lignes).
    const text = pdf!.buffer.toString('latin1');
    const pagesCountMatch = text.match(/\/Type\s*\/Pages[\s\S]{0,40}\/Count\s+(\d+)/);
    expect(pagesCountMatch).not.toBeNull();
    const pageCount = Number(pagesCountMatch![1]);
    expect(pageCount).toBeGreaterThan(0);
    expect(pageCount).toBeLessThanOrEqual(4);

    await pool.end();
  }, 30000);
});
