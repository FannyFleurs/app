// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import AttachCustomerAfterSaleModal from '@/app/(app)/ma-journee/AttachCustomerAfterSaleModal';

/**
 * « Attribuer un client » (vente sans client) et « Changer de client » (vente
 * qui en a déjà un) ouvrent la MÊME modale. Elle doit avoir la même apparence
 * que la recherche client en caisse (CustomerPickerModal) : pas de liste qui
 * charge automatiquement à l'ouverture, juste le champ de recherche — on ne
 * charge la liste qu'en tapant, ou via le bouton « Afficher la liste ».
 */
let fetchCalls: string[] = [];

beforeEach(() => {
  fetchCalls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    fetchCalls.push(url);
    if (url.startsWith('/api/customers')) {
      return {
        ok: true,
        json: async () => ({
          customers: [{ id: 'c1', display_name: 'Marie Dupont', email: null, phone: '0600000000' }],
        }),
      } as unknown as Response;
    }
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Modale client post-vente (Ma Journée)', () => {
  it('"Attribuer un client" : titre neutre, aucun appel réseau avant saisie (pas de chargement auto de la liste)', async () => {
    render(<AttachCustomerAfterSaleModal saleId="s1" onClose={() => {}} onSuccess={() => {}} />);
    expect(screen.getByText('Attribuer un client')).toBeTruthy();
    expect(screen.getByText('Recherchez un client par nom ou numéro de téléphone.')).toBeTruthy();
    expect(screen.getByText('Afficher la liste')).toBeTruthy();
    // Laisse le temps à un éventuel useEffect fautif de se déclencher.
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchCalls.some((u) => u.startsWith('/api/customers'))).toBe(false);
  });

  it('"Changer de client" : titre et rappel du client actuel, même comportement de recherche différée', () => {
    render(
      <AttachCustomerAfterSaleModal
        saleId="s1" currentCustomerName="Jean Martin" onClose={() => {}} onSuccess={() => {}}
      />,
    );
    expect(screen.getByText('Changer de client')).toBeTruthy();
    expect(screen.getByText('Jean Martin')).toBeTruthy();
    expect(screen.getByText('Recherchez un client par nom ou numéro de téléphone.')).toBeTruthy();
  });

  it('taper dans le champ déclenche la recherche (débounce)', async () => {
    render(<AttachCustomerAfterSaleModal saleId="s1" onClose={() => {}} onSuccess={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('Nom ou téléphone…'), { target: { value: 'Marie' } });
    await waitFor(() => expect(screen.getByText('Marie Dupont')).toBeTruthy());
    expect(fetchCalls.some((u) => u.includes('q=Marie'))).toBe(true);
  });

  it('"Afficher la liste" charge la liste complète sans recherche', async () => {
    render(<AttachCustomerAfterSaleModal saleId="s1" onClose={() => {}} onSuccess={() => {}} />);
    fireEvent.click(screen.getByText('Afficher la liste'));
    await waitFor(() => expect(screen.getByText('Marie Dupont')).toBeTruthy());
    expect(screen.getByText('Masquer la liste')).toBeTruthy();
  });

  it('sélectionner un client appelle attach-customer et prévient le parent', async () => {
    const onSuccess = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      fetchCalls.push(url);
      if (url.startsWith('/api/customers')) {
        return { ok: true, json: async () => ({ customers: [{ id: 'c1', display_name: 'Marie Dupont', email: null, phone: null }] }) } as unknown as Response;
      }
      if (url === '/api/sales/s1/attach-customer' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ customer_id: 'c1' });
        return { ok: true, json: async () => ({ customer_id: 'c1', loyalty: { earned: 5, new_balance: 5 } }) } as unknown as Response;
      }
      return { ok: true, json: async () => ({}) } as unknown as Response;
    }));
    render(<AttachCustomerAfterSaleModal saleId="s1" onClose={() => {}} onSuccess={onSuccess} />);
    fireEvent.change(screen.getByPlaceholderText('Nom ou téléphone…'), { target: { value: 'Marie' } });
    await waitFor(() => screen.getByText('Marie Dupont'));
    fireEvent.click(screen.getByText('Marie Dupont'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ earned: 5, new_balance: 5 }));
  });

  it('affiche un message clair quand une facture bloque le changement de client', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/customers')) {
        return { ok: true, json: async () => ({ customers: [{ id: 'c2', display_name: 'Bob B', email: null, phone: null }] }) } as unknown as Response;
      }
      if (url === '/api/sales/s1/attach-customer' && init?.method === 'POST') {
        return { ok: false, json: async () => ({ error: 'INVOICE_ALREADY_GENERATED' }) } as unknown as Response;
      }
      return { ok: true, json: async () => ({}) } as unknown as Response;
    }));
    render(
      <AttachCustomerAfterSaleModal
        saleId="s1" currentCustomerName="Alice A" onClose={() => {}} onSuccess={() => {}}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('Nom ou téléphone…'), { target: { value: 'Bob' } });
    await waitFor(() => screen.getByText('Bob B'));
    fireEvent.click(screen.getByText('Bob B'));
    await waitFor(() => expect(screen.getByText(
      'Une facture a déjà été émise pour cette vente : le client ne peut plus être changé.',
    )).toBeTruthy());
  });
});
