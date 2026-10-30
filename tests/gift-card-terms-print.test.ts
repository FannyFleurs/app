import { describe, it, expect } from 'vitest';
import { wrapText, buildGiftCardStarPrnt, type GiftCardReceiptData } from '@/lib/services/cloudprnt/receipt-star';
import { renderGiftCardPdf, type GiftCardPdfData, type OrgInfo } from '@/lib/services/gift-card-pdf';
import { mergeReceiptDefaults } from '@/lib/settings/receipt';

/**
 * Conditions d'utilisation de la carte cadeau (Réglages → Ticket → Carte
 * cadeau, champ `gift_card_terms`) : imprimées sur le ticket de la carte,
 * en plus de la mention légale fixe déjà présente. Deux circuits : le ticket
 * StarPRNT (imprimante physique, prioritaire) et le PDF (repli / réimpression
 * depuis le back-office).
 */

const gc: GiftCardReceiptData = {
  code: '2012345678909',
  initial_amount: 50,
  balance: 50,
  issued_at: '2026-10-30T10:00:00.000Z',
  expires_at: null,
  buyer_name: null,
  org_name: 'Fanny Fleurs',
  store_name: 'Boutique Bastille',
};

describe('wrapText', () => {
  it('ne dépasse jamais la largeur demandée', () => {
    const text = 'Valable un an a compter de la date d emission. Utilisable en plusieurs fois.';
    const lines = wrapText(text, 32);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(32);
  });

  it('respecte les retours à la ligne saisis manuellement', () => {
    const lines = wrapText('Ligne un\nLigne deux', 32);
    expect(lines).toEqual(['Ligne un', 'Ligne deux']);
  });

  it('coupe un mot isolé plus long que la largeur plutôt que de déborder', () => {
    const lines = wrapText('a'.repeat(50), 32);
    expect(lines.every((l) => l.length <= 32)).toBe(true);
  });

  it('chaîne vide : une ligne vide, pas de crash', () => {
    expect(wrapText('', 32)).toEqual(['']);
  });
});

describe('Ticket StarPRNT carte cadeau', () => {
  it('sans conditions configurées : imprime quand même la mention légale fixe', async () => {
    const buf = await buildGiftCardStarPrnt(gc, mergeReceiptDefaults(null));
    const text = buf.toString('latin1');
    expect(text).toContain('Non rechargeable, non remboursable en especes.');
  });

  it('avec conditions configurées : le texte apparaît sur le ticket, enveloppé', async () => {
    const settings = mergeReceiptDefaults({
      gift_card_terms: 'Valable un an a compter de la date d emission du present support.',
    });
    const buf = await buildGiftCardStarPrnt(gc, settings, 58); // 58mm = 32 colonnes
    const text = buf.toString('latin1');
    expect(text).toContain('Valable un an');
    expect(text).toContain('emission du present');
  });

  it('conditions vides : aucune ligne superflue ajoutée', async () => {
    const withEmpty = await buildGiftCardStarPrnt(gc, mergeReceiptDefaults({ gift_card_terms: '   ' }));
    const withoutField = await buildGiftCardStarPrnt(gc, mergeReceiptDefaults(null));
    expect(withEmpty.length).toBe(withoutField.length);
  });
});

describe('PDF carte cadeau', () => {
  const data: GiftCardPdfData = {
    code: '2012345678909', amount: 50, issued_at: '2026-10-30T10:00:00.000Z',
  };
  const org: OrgInfo = { name: 'Fanny Fleurs' };

  it('génère un PDF valide avec des conditions longues, sans erreur', async () => {
    const terms = 'Carte valable un an a compter de sa date d\'émission. '
      + 'Utilisable en une ou plusieurs fois, dans la limite du solde disponible. '
      + 'Non échangeable contre des espèces.';
    const buf = await renderGiftCardPdf(data, org, { terms });
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('sans conditions : PDF toujours valide', async () => {
    const buf = await renderGiftCardPdf(data, org, {});
    expect(buf.length).toBeGreaterThan(500);
  });
});
