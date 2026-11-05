// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import PaymentMethodsForm from '@/app/(app)/settings/payment-methods/PaymentMethodsForm';

/**
 * Sur un poste de caisse appairé (lockedStoreId renseigné — voir
 * resolveSettingsLockStoreId), la page « Modes de règlement » ne doit
 * montrer AUCUN contrôle inter-boutiques : ni le sélecteur de boutique pour
 * le Tiroir, ni la rangée « Boutiques : » (visibilité par boutique, voir
 * toggleStore/setAllStores) — remontée en production : l'utilisateur voit
 * toujours « Toutes les boutiques » sur sa caisse alors que chaque boutique
 * doit gérer uniquement son propre réglage. La case Tiroir elle-même reste
 * fonctionnelle, scopée implicitement sur lockedStoreId.
 */

const STORES = [
  { id: 'store-a', name: 'Boutique A' },
  { id: 'store-b', name: 'Boutique B' },
];

const PAYMENT_METHODS = [
  { id: 'pm-1', code: 'cash', kind: 'cash', label: 'Espèces', is_active: true, position: 0, store_ids: [] },
];

function stubFetch(drawerSettings: Record<string, boolean> = { cash: true }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/payment-methods') && (!init || init.method === undefined)) {
      return { ok: true, json: async () => ({ methods: PAYMENT_METHODS }) } as unknown as Response;
    }
    if (url.startsWith('/api/settings/payment-method-drawer') && (!init || init.method === undefined)) {
      return { ok: true, json: async () => ({ settings: drawerSettings }) } as unknown as Response;
    }
    if (url.startsWith('/api/settings/order-auto-checkout') && (!init || init.method === undefined)) {
      return {
        ok: true,
        json: async () => ({ settings: { enabled: false, web_payment_method_id: null, ogf_payment_method_id: null } }),
      } as unknown as Response;
    }
    return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
  }));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Modes de règlement — poste de caisse appairé (lockedStoreId)', () => {
  beforeEach(() => stubFetch());

  it('masque le sélecteur de boutique du Tiroir', async () => {
    render(<PaymentMethodsForm canWrite stores={STORES} lockedStoreId="store-a" />);
    await waitFor(() => screen.getByText('Espèces'));
    expect(screen.queryByText('Tiroir pour la boutique')).toBeNull();
  });

  it('masque la rangée « Boutiques : » (visibilité inter-boutiques)', async () => {
    render(<PaymentMethodsForm canWrite stores={STORES} lockedStoreId="store-a" />);
    await waitFor(() => screen.getByText('Espèces'));
    expect(screen.queryByText('Boutiques :')).toBeNull();
    expect(screen.queryByText('Toutes')).toBeNull();
  });

  it('la case Tiroir reste fonctionnelle, scopée implicitement sur la boutique verrouillée', async () => {
    render(<PaymentMethodsForm canWrite stores={STORES} lockedStoreId="store-a" />);
    await waitFor(() => screen.getByText('Espèces'));
    const label = screen.getByTitle(/pour la boutique sélectionnée/);
    const checkbox = label.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await waitFor(() => expect(checkbox.checked).toBe(true));
  });
});

describe('Modes de règlement — back-office (pas de boutique verrouillée)', () => {
  beforeEach(() => stubFetch());

  it('affiche le sélecteur de boutique du Tiroir et la rangée « Boutiques : »', async () => {
    render(<PaymentMethodsForm canWrite stores={STORES} />);
    await waitFor(() => screen.getByText('Espèces'));
    expect(screen.getByText('Tiroir pour la boutique')).toBeTruthy();
    expect(screen.getByText('Boutiques :')).toBeTruthy();
  });
});
