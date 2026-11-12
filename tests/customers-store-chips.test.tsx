// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import CustomersList from '@/app/(app)/customers/CustomersList';

/**
 * Fiche client — puces « boutique(s) d'achat ».
 *
 * Un client est global à l'organisation (pas de store_id sur `customers`) :
 * la ou les boutiques affichées sont celles constatées dans son historique
 * de ventes (GET /api/customers/[id] renvoie `stores`), jamais un champ
 * propre au client. Masquées pour une organisation mono-boutique (toujours
 * la même boutique, sans intérêt).
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

const STORES = [
  { id: 'store-ff', name: 'Fanny Fleurs' },
  { id: 'store-pv', name: 'Plante Verte' },
];

const CLIENTS = [
  { id: 'c1', type: 'particulier', display_name: 'Marie Lefèvre', email: 'marie@ex.fr',
    phone: null, company_name: null, siret: null, nb_sales: '2', last_visit: null,
    total_ttc: '120', loyalty_points: null },
  { id: 'c2', type: 'particulier', display_name: 'Paul Durand', email: 'paul@ex.fr',
    phone: null, company_name: null, siret: null, nb_sales: '0', last_visit: null,
    total_ttc: '0', loyalty_points: null },
];

function detail(id: string, nom: string, stores: { id: string; name: string }[]) {
  return {
    customer: {
      id, type: 'particulier', first_name: nom, last_name: '', company_name: null,
      email: `${nom}@ex.fr`, phone: null, siret: null, siren: null, vat_number: null,
      public_service_code: null, commitment_number: null, address: null,
      consent_email: true, consent_sms: false, internal_notes: null, loyalty_code: null,
      created_at: '2026-01-01T00:00:00Z',
    },
    sales: [], loyalty_points: 0, stores,
  };
}

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    // Achète dans les deux boutiques.
    if (url.startsWith('/api/customers/c1')) {
      return { ok: true, json: async () => detail('c1', 'Marie', STORES) } as unknown as Response;
    }
    // N'a jamais acheté (pas de boutique constatée).
    if (url.startsWith('/api/customers/c2')) {
      return { ok: true, json: async () => detail('c2', 'Paul', []) } as unknown as Response;
    }
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function ouvrir(nom: string) {
  fireEvent.click(screen.getByText(nom));
  await waitFor(() => screen.getAllByRole('tab'));
}

describe('Fiche client — puces boutique(s) d\'achat', () => {
  beforeEach(stubFetch);

  it('affiche une puce par boutique où le client a déjà acheté, avec le vrai nom de la boutique', async () => {
    render(<CustomersList customers={CLIENTS} total={2} stores={STORES} canWrite />);
    await ouvrir('Marie Lefèvre');
    await waitFor(() => screen.getByText('Fanny Fleurs'));
    expect(screen.getByText('Plante Verte')).toBeTruthy();
  });

  it('un client sans achat ne montre aucune puce (pas de boutique inventée)', async () => {
    render(<CustomersList customers={CLIENTS} total={2} stores={STORES} canWrite />);
    await ouvrir('Paul Durand');
    await waitFor(() => screen.getAllByRole('tab'));
    expect(screen.queryByText('Fanny Fleurs')).toBeNull();
    expect(screen.queryByText('Plante Verte')).toBeNull();
  });

  it('organisation mono-boutique : aucune puce, même si le client a des ventes', async () => {
    render(<CustomersList customers={CLIENTS} total={2} stores={[STORES[0]!]} canWrite />);
    await ouvrir('Marie Lefèvre');
    await waitFor(() => screen.getAllByRole('tab'));
    expect(screen.queryByText('Fanny Fleurs')).toBeNull();
  });
});
