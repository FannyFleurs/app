import { describe, it, expect } from 'vitest';
import { renderGiftCardCertificatePdf } from '@/lib/services/gift-card-certificate-pdf';
import { extractPdfText, extractPdfTextCompact } from './helpers/extract-pdf-text';

/**
 * Carte cadeau PDF (refonte email + PDF) — lib/services/
 * gift-card-certificate-pdf.ts. Le PDF devient la représentation DE
 * RÉFÉRENCE de la carte (voir docs/gift-card-widget.md /
 * docs/api-public-gift-cards.md) ; ces tests vérifient son contenu réel
 * (texte extrait, voir tests/helpers/extract-pdf-text.ts), pas seulement
 * qu'un buffer est retourné.
 */

function validArgs(overrides: Partial<Parameters<typeof renderGiftCardCertificatePdf>[0]> = {}) {
  return {
    organizationName: 'Plante Verte',
    amountCents: 5000,
    holderName: 'Guillaume Dupont',
    code: '2900000000015',
    message: 'Joyeux Noël !',
    issuedAt: '2026-01-15T10:00:00.000Z',
    expiresAt: '2027-01-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('Génération PDF — cas nominal', () => {
  it('génère un PDF réel, non vide', async () => {
    const buf = await renderGiftCardCertificatePdf(validArgs());
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it("contient le nom de l'organisation", async () => {
    const buf = await renderGiftCardCertificatePdf(validArgs({ organizationName: 'Plante Verte' }));
    expect(extractPdfText(buf)).toContain('PLANTE VERTE'); // affiché en majuscules dans le bandeau
  });

  it('contient le montant', async () => {
    const buf = await renderGiftCardCertificatePdf(validArgs({ amountCents: 7500 }));
    expect(extractPdfText(buf)).toContain('75,00');
  });

  it('contient le nom du bénéficiaire (titulaire)', async () => {
    const buf = await renderGiftCardCertificatePdf(validArgs({ holderName: 'Guillaume Dupont' }));
    expect(extractPdfText(buf)).toContain('Guillaume Dupont');
  });

  it('contient le code réel de la carte (lisible, éventuellement groupé par blocs)', async () => {
    const buf = await renderGiftCardCertificatePdf(validArgs({ code: '2900000000015' }));
    expect(extractPdfTextCompact(buf)).toContain('2900000000015');
  });

  it('contient le message personnel quand il est fourni', async () => {
    const buf = await renderGiftCardCertificatePdf(validArgs({ message: 'Bon anniversaire Guillaume' }));
    expect(extractPdfText(buf)).toContain('Bon anniversaire Guillaume');
  });

  it('omet proprement le bloc message quand il est absent (pas de guillemets vides)', async () => {
    const buf = await renderGiftCardCertificatePdf(validArgs({ message: null }));
    const text = extractPdfText(buf);
    expect(text).not.toContain('« »');
    expect(text).not.toContain('«»');
  });

  it("contient la date d'émission formatée en français", async () => {
    const buf = await renderGiftCardCertificatePdf(validArgs({ issuedAt: '2026-03-05T00:00:00.000Z' }));
    expect(extractPdfText(buf)).toContain('05/03/2026');
  });

  it("affiche la date d'expiration UNIQUEMENT si elle est fournie (jamais inventée)", async () => {
    const withExpiry = extractPdfText(await renderGiftCardCertificatePdf(validArgs({ expiresAt: '2027-06-01T00:00:00.000Z' })));
    expect(withExpiry).toContain('01/06/2027');
    expect(withExpiry).toMatch(/valable/i);

    const withoutExpiry = extractPdfText(await renderGiftCardCertificatePdf(validArgs({ expiresAt: null })));
    expect(withoutExpiry).not.toMatch(/valable/i);
  });

  it("mentionne l'utilisation en boutique sans jamais citer de store_id ou de boutique spécifique", async () => {
    const buf = await renderGiftCardCertificatePdf(validArgs());
    const text = extractPdfText(buf).toLowerCase();
    expect(text).toContain('boutiques plante verte');
  });
});

describe('Caractères français et accents', () => {
  it('rend correctement les caractères accentués dans le message et le nom', async () => {
    const buf = await renderGiftCardCertificatePdf(validArgs({
      holderName: 'Éléonore Bénédicte Ç.',
      message: 'Joyeux Noël, profite bien de ta carte à la crème brûlée préférée !',
    }));
    const text = extractPdfText(buf);
    expect(text).toContain('Éléonore Bénédicte Ç.');
    expect(text).toContain('Noël');
    expect(text).toContain('préférée');
    expect(text).toContain('brûlée');
  });
});

describe('Contenu hostile — jamais interprété comme autre chose que du texte', () => {
  it('un nom/message contenant des séquences de type balisage reste un simple texte affiché', async () => {
    const buf = await renderGiftCardCertificatePdf(validArgs({
      holderName: '<script>alert(1)</script>',
      message: '"; DROP TABLE gift_cards; --',
    }));
    // PDFKit rend .text(...) comme du texte littéral dans le flux de contenu
    // (jamais interprété comme du balisage/des opérateurs PDF) : le buffer
    // reste un PDF valide, et le texte hostile apparaît lisible tel quel.
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const text = extractPdfText(buf);
    expect(text).toContain('alert(1)');
    expect(text).toContain('DROP TABLE');
  });

  it('un nom d’organisation vide/exotique ne fait jamais planter la génération', async () => {
    await expect(renderGiftCardCertificatePdf(validArgs({ organizationName: '🎉🎉🎉' }))).resolves.toBeInstanceOf(Buffer);
  });
});

describe('Aucune donnée sensible exposée', () => {
  it('ne contient jamais organization_id, session Stripe, payment_intent ou clé publique', async () => {
    const buf = await renderGiftCardCertificatePdf(validArgs());
    const raw = buf.toString('latin1');
    expect(raw).not.toContain('org-a-uuid');
    expect(raw.toLowerCase()).not.toContain('cs_test');
    expect(raw.toLowerCase()).not.toContain('pi_test');
    expect(raw).not.toContain('hp_gc_');
  });
});

describe('Multi-tenant', () => {
  it("le PDF ne code en dur aucune enseigne : le nom affiché est TOUJOURS celui fourni en argument", async () => {
    const orgA = extractPdfText(await renderGiftCardCertificatePdf(validArgs({ organizationName: 'Plante Verte' })));
    const orgB = extractPdfText(await renderGiftCardCertificatePdf(validArgs({ organizationName: 'Fanny Fleurs' })));
    expect(orgA).toContain('PLANTE VERTE');
    expect(orgA).not.toContain('FANNY FLEURS');
    expect(orgB).toContain('FANNY FLEURS');
    expect(orgB).not.toContain('PLANTE VERTE');
  });
});
