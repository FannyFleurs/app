// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ProductFormModal from '@/app/(app)/products/ProductFormModal';

/**
 * Fiche produit, bloc "Prix et marge" : nouveau champ "Coef. de vente",
 * entre Taux TVA et Prix de vente TTC. Bidirectionnel avec le prix de
 * vente, même formule que l'encart "Marge estimée" déjà existant
 * (coef = prix de vente HT / (prix d'achat HT + coût transport HT)) —
 * pour que la saisie et l'affichage ne se contredisent jamais.
 */
function fill(label: string, value: string) {
  const el = screen.getByText(label).parentElement!.querySelector('input') as HTMLInputElement;
  fireEvent.change(el, { target: { value } });
}
function fieldValue(label: string): string {
  const el = screen.getByText(label).parentElement!.querySelector('input') as HTMLInputElement;
  return el.value;
}

const TAX_RATES = [{ id: 'tva20', code: 'TVA20', rate: 20, label: '20%', is_default: true }];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith('/api/categories')) return { ok: true, json: async () => ({ categories: [] }) } as unknown as Response;
    if (url.startsWith('/api/suppliers')) return { ok: true, json: async () => ({ suppliers: [] }) } as unknown as Response;
    if (url.startsWith('/api/me')) return { ok: true, json: async () => ({ stores: [] }) } as unknown as Response;
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Fiche produit — coefficient de vente', () => {
  it('saisir le coefficient met à jour le prix de vente TTC', () => {
    render(
      <ProductFormModal
        product={null}
        taxRates={TAX_RATES}
        categories={[]}
        onClose={() => {}}
        onSaved={() => {}}
        backOffice
      />,
    );
    fill("Prix d'achat HT (€)", '10');
    fill('Coef. de vente', '2');
    // HT vente = 10 * 2 = 20 ; TTC = 20 * 1.20 = 24.00
    expect(fieldValue('Prix de vente TTC (€)')).toBe('24');
  });

  it('saisir le prix de vente TTC met à jour le coefficient', () => {
    render(
      <ProductFormModal
        product={null}
        taxRates={TAX_RATES}
        categories={[]}
        onClose={() => {}}
        onSaved={() => {}}
        backOffice
      />,
    );
    fill("Prix d'achat HT (€)", '10');
    fill('Prix de vente TTC (€)', '24');
    // HT vente = 24 / 1.20 = 20 ; coef = 20 / 10 = 2.00
    expect(fieldValue('Coef. de vente')).toBe('2');
  });

  it('modifier le prix d\'achat (coef déjà posé) recalcule le coef, PAS le prix de vente', () => {
    render(
      <ProductFormModal
        product={null}
        taxRates={TAX_RATES}
        categories={[]}
        onClose={() => {}}
        onSaved={() => {}}
        backOffice
      />,
    );
    fill("Prix d'achat HT (€)", '10');
    fill('Prix de vente TTC (€)', '24'); // coef -> 2
    expect(fieldValue('Coef. de vente')).toBe('2');

    fill("Prix d'achat HT (€)", '20'); // coût double, prix de vente reste fixe
    expect(fieldValue('Prix de vente TTC (€)')).toBe('24'); // inchangé
    // HT vente = 24/1.20 = 20 ; coef = 20/20 = 1.00
    expect(fieldValue('Coef. de vente')).toBe('1');
  });

  it('une fiche existante affiche le coefficient déjà déduit des prix enregistrés', () => {
    render(
      <ProductFormModal
        product={{
          id: 'p1', name: 'Bouquet', short_description: null, sku: null, barcode: null,
          sale_price_ttc: 24, price_is_free: false, purchase_price_ht: 10, transport_cost_ht: null,
          tax_rate_id: 'tva20', category_id: null, visible_in_pos: true, is_active: true,
          is_seasonal: false, is_customizable: false,
        }}
        taxRates={TAX_RATES}
        categories={[]}
        onClose={() => {}}
        onSaved={() => {}}
        backOffice
      />,
    );
    expect(fieldValue('Coef. de vente')).toBe('2');
  });

  it('le champ coefficient est désactivé en mode "Prix libre"', () => {
    render(
      <ProductFormModal
        product={{
          id: 'p1', name: 'Bouquet', short_description: null, sku: null, barcode: null,
          sale_price_ttc: 24, price_is_free: true, purchase_price_ht: 10, transport_cost_ht: null,
          tax_rate_id: 'tva20', category_id: null, visible_in_pos: true, is_active: true,
          is_seasonal: false, is_customizable: false,
        }}
        taxRates={TAX_RATES}
        categories={[]}
        onClose={() => {}}
        onSaved={() => {}}
        backOffice
      />,
    );
    const el = screen.getByText('Coef. de vente').parentElement!.querySelector('input') as HTMLInputElement;
    expect(el.disabled).toBe(true);
  });
});
