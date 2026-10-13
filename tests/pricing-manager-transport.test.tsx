// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import PricingManager, { ceilToTenth, parseNum } from '@/app/(app)/pricing/PricingManager';

/**
 * Gestion de prix (back-office) : le coefficient/prix de vente TTC ignorait
 * le transport HT (déjà calculé et affiché, mais jamais inclus dans le
 * coût de référence du coefficient) — contrairement à l'encart "Marge
 * estimée" de la fiche produit, qui l'a toujours inclus. Corrigé pour que
 * le coût de référence soit systématiquement achat HT + transport HT.
 *
 * Et le prix de vente TTC calculé doit être arrondi au dixième SUPÉRIEUR
 * (ex. 2,87 € → 2,90 €) — un prix d'appel, pas un arrondi classique.
 */
describe('ceilToTenth — arrondi au dixième supérieur', () => {
  it('arrondit au-dessus du dixième', () => {
    expect(ceilToTenth(2.87)).toBe(2.9);
    expect(ceilToTenth(1.43)).toBe(1.5);
    expect(ceilToTenth(9.991)).toBe(10);
  });

  it('ne bascule pas un prix déjà "rond" au palier suivant (bruit flottant)', () => {
    expect(ceilToTenth(10 * 0.29)).toBe(2.9); // 2.9000000000000004 en JS brut
    expect(ceilToTenth(2.9)).toBe(2.9);
    expect(ceilToTenth(3)).toBe(3);
  });
});

describe('parseNum — tolère virgule ou point', () => {
  it('convertit "2,87" et "2.87" identiquement', () => {
    expect(parseNum('2,87')).toBe(2.87);
    expect(parseNum('2.87')).toBe(2.87);
  });
});

const CATEGORY = { id: 'cat-1', name: 'Bouquets', transport_cost_ht: 0, transport_cost_pct: null };
const PRODUCT = {
  id: 'p-1', name: 'Bouquet rond', category_id: 'cat-1',
  sale_price_ttc: 0, purchase_price_ht: null, transport_cost_ht: null, tax_rate: 20,
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith('/api/categories')) {
      return { ok: true, json: async () => ({ categories: [CATEGORY] }) } as unknown as Response;
    }
    if (url.startsWith('/api/products')) {
      return { ok: true, json: async () => ({ products: [PRODUCT] }) } as unknown as Response;
    }
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function selectCategory() {
  render(<PricingManager />);
  await waitFor(() => screen.getByText('Choisissez une catégorie pour afficher ses articles.'));
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cat-1' } });
  await waitFor(() => screen.getByDisplayValue('Bouquet rond'));
  const row = screen.getByDisplayValue('Bouquet rond').closest('tr')!;
  return {
    purchase: within(row).getAllByRole('textbox')[1] as HTMLInputElement, // Achat HT
    transport: within(row).getAllByRole('textbox')[2] as HTMLInputElement, // Transport HT
    coef: within(row).getAllByRole('textbox')[3] as HTMLInputElement, // Coef
    sale: within(row).getAllByRole('textbox')[4] as HTMLInputElement, // Vente TTC
  };
}

describe('Gestion de prix — le transport pèse sur le prix de vente TTC', () => {
  it('saisir achat + coef calcule la vente avec achat SEUL (transport à 0) : cas de référence', async () => {
    const { purchase, coef, sale } = await selectCategory();
    fireEvent.change(purchase, { target: { value: '10' } });
    fireEvent.change(coef, { target: { value: '2' } });
    await waitFor(() => expect(sale.value).toBe('20'));
  });

  it('ajouter un transport recalcule la vente à coef constant (coût = achat + transport)', async () => {
    const { purchase, transport, coef, sale } = await selectCategory();
    fireEvent.change(purchase, { target: { value: '10' } });
    fireEvent.change(coef, { target: { value: '2' } });
    await waitFor(() => expect(sale.value).toBe('20'));

    // + 2€ de transport : coût 12€ × coef 2 = 24€ (PAS 20€, le transport
    // doit maintenant peser sur le prix de vente).
    fireEvent.change(transport, { target: { value: '2' } });
    await waitFor(() => expect(sale.value).toBe('24'));
  });

  it('le coefficient affiché tient compte du transport déjà présent (achat + transport, pas achat seul)', async () => {
    const { purchase, transport, sale, coef } = await selectCategory();
    fireEvent.change(purchase, { target: { value: '10' } });
    fireEvent.change(transport, { target: { value: '2' } });
    // Vente saisie directement à 24€ : coef = 24 / (10+2) = 2, PAS 24/10 = 2.4.
    fireEvent.change(sale, { target: { value: '24' } });
    await waitFor(() => expect(coef.value).toBe('2'));
  });

  it('le prix de vente TTC calculé est arrondi au dixième supérieur (2,87 → 2,9)', async () => {
    const { purchase, coef, sale } = await selectCategory();
    fireEvent.change(purchase, { target: { value: '2.87' } });
    fireEvent.change(coef, { target: { value: '1' } });
    await waitFor(() => expect(sale.value).toBe('2.9'));
  });

  it('changer le transport seul applique aussi l\'arrondi au dixième supérieur', async () => {
    const { purchase, transport, coef, sale } = await selectCategory();
    fireEvent.change(purchase, { target: { value: '1' } });
    fireEvent.change(coef, { target: { value: '1' } });
    await waitFor(() => expect(sale.value).toBe('1'));
    fireEvent.change(transport, { target: { value: '1.43' } }); // coût 2.43 × coef 1 = 2.43 → 2.5
    await waitFor(() => expect(sale.value).toBe('2.5'));
  });
});
