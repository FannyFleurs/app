// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import CustomersList from '@/app/(app)/customers/CustomersList';

/**
 * Navigation de la fiche client.
 *
 * La fiche s'ouvrait derrière une colonne de menu vertical ; elle est passée
 * en onglets. Deux choses doivent tenir : les onglets sont bien des onglets
 * (une barre, un seul actif), et cliquer un client rouvre toujours sur le
 * Dashboard — sinon on hérite de l'onglet consulté sur le client précédent,
 * et l'on croit lire ses informations alors qu'on lit les siennes.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

const CLIENTS = [
  { id: 'c1', type: 'particulier', display_name: 'Marie Lefèvre', email: 'marie@ex.fr',
    phone: null, company_name: null, siret: null, nb_sales: '2', last_visit: null,
    total_ttc: '120', loyalty_points: null },
  { id: 'c2', type: 'particulier', display_name: 'Paul Durand', email: 'paul@ex.fr',
    phone: null, company_name: null, siret: null, nb_sales: '0', last_visit: null,
    total_ttc: '0', loyalty_points: null },
];

const detail = (id: string, nom: string) => ({
  customer: {
    id, type: 'particulier', first_name: nom, last_name: '', company_name: null,
    email: `${nom}@ex.fr`, phone: null, siret: null, siren: null, vat_number: null,
    public_service_code: null, commitment_number: null, address: null,
    consent_email: true, consent_sms: false, internal_notes: null, loyalty_code: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  sales: [], loyalty_points: 0,
});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith('/api/customers/c1')) {
      return { ok: true, json: async () => detail('c1', 'Marie') } as unknown as Response;
    }
    if (url.startsWith('/api/customers/c2')) {
      return { ok: true, json: async () => detail('c2', 'Paul') } as unknown as Response;
    }
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const actif = () => screen.getAllByRole('tab')
  .find((t) => t.getAttribute('aria-selected') === 'true')?.textContent;

async function ouvrir(nom: string) {
  fireEvent.click(screen.getByText(nom));
  await waitFor(() => screen.getAllByRole('tab'));
}

describe('Fiche client — onglets', () => {
  it('présente la navigation en onglets, un seul actif', async () => {
    render(<CustomersList customers={CLIENTS} total={2} canWrite />);
    await ouvrir('Marie Lefèvre');

    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Dashboard', 'Informations', 'Commentaires', 'Tickets', 'Achats',
      'Avoirs', 'Fidélité', "Bons d'achats",
    ]);
    expect(screen.getAllByRole('tab').filter((t) => t.getAttribute('aria-selected') === 'true'))
      .toHaveLength(1);
  });

  it('ouvre sur le Dashboard au clic sur un client', async () => {
    render(<CustomersList customers={CLIENTS} total={2} canWrite />);
    await ouvrir('Marie Lefèvre');
    expect(actif()).toBe('Dashboard');
    expect(screen.getByText('Total des achats')).toBeTruthy();
  });

  it('revient au Dashboard quand on passe à un autre client', async () => {
    // Le cas qui trompe : rester sur « Informations » d'un client à l'autre
    // donne à lire une fiche pour une autre.
    render(<CustomersList customers={CLIENTS} total={2} canWrite />);
    await ouvrir('Marie Lefèvre');
    fireEvent.click(screen.getByRole('tab', { name: 'Informations' }));
    expect(actif()).toBe('Informations');

    await ouvrir('Paul Durand');
    expect(actif()).toBe('Dashboard');
  });
});
