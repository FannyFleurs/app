import { describe, it, expect } from 'vitest';
import { renderReportPdf } from '@/lib/services/z-report-pdf';
import type { DayReport } from '@/lib/services/day-report';

const report: DayReport = {
  kind: 'X',
  identity: {
    name: 'Fanny Fleurs', legal_name: 'Fanny Fleurs SARL',
    line1: '1 rue des Lilas', line2: null, zip: '75011', city: 'Paris',
    country: 'France', phone: '01 23 45 67 89', siret: '12345678900011',
    siren: null, vat_number: 'FR00123456789', website: 'hellopos.fr',
  },
  store_name: 'Boutique Bastille',
  journee_number: 42,
  opened_at: '2026-08-19T08:00:00.000Z',
  closed_at: null,
  printed_at: '2026-08-19T18:30:00.000Z',
  closed_by: null,
  fiscal_hash: null,
  totals: {
    ca_ttc: 1234.5, ca_ht: 1120.9, ca_tva: 113.6, ticket_count: 37,
    ticket_moyen_ttc: 33.36, marge_brute_ht: 640.2, discounts_total: 42,
    offerts_count: 2, offerts_total: 15,
  },
  tva_by_rate: [{ rate: 20, tva: 90, ttc: 540, ht: 450 }, { rate: 10, tva: 23.6, ttc: 259.6, ht: 236 }],
  payments: [{ method: 'card', count: 20, amount: 800 }, { method: 'cash', count: 17, amount: 434.5 }],
  settlements: [],
  cash: {
    fonds_de_caisse: 100, entrees_argent: 0, remise_banque: 0,
    total_espece_fermeture: 534.5, tiroir_sans_ticket: 1, counted: 534.5, variance: 0,
  },
  by_vendor: [{ name: 'Julie', ca_ttc: 700 }, { name: 'Marc', ca_ttc: 534.5 }],
  by_category: [{ name: 'Bouquets', ca_ttc: 900 }, { name: 'Plantes', ca_ttc: 334.5 }],
  by_mode: [{ mode: 'Comptoir', ca_ttc: 1234.5 }],
  tickets: { normal_count: 37, normal_total: 1234.5 },
};

/** Largeur de la MediaBox depuis les octets PDF (…/MediaBox [0 0 W H]). */
function mediaBoxWidth(buf: Buffer): number {
  const m = buf.toString('latin1').match(/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  return m ? Number(m[1]) : NaN;
}

describe('renderReportPdf', () => {
  it('A4 par défaut (~595 pt de large)', async () => {
    const buf = await renderReportPdf(report);
    expect(buf.length).toBeGreaterThan(500);
    expect(mediaBoxWidth(buf)).toBeCloseTo(595.28, 0);
  });

  it('thermal: ticket 80 mm (226 pt de large)', async () => {
    const buf = await renderReportPdf(report, { thermal: true });
    expect(buf.length).toBeGreaterThan(500);
    expect(mediaBoxWidth(buf)).toBe(226);
  });
});
