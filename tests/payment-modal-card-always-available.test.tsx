// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import PaymentModal from '@/app/(app)/caisse/PaymentModal';

/**
 * « Carte Bancaire » est le raccourci rapide du panier (quickPayCard), mais
 * reste TOUJOURS disponible comme mode de règlement sur la page « Autres »
 * (PaymentModal) — au cas où le raccourci ne convient pas pour ce
 * règlement précis (ex. montant partiel, combiné à un solde dû…). Seuls
 * « En compte » et « Lien de paiement » sont exclus en mode règlement de
 * solde — jamais la carte.
 */

const METHODS = [
  { id: 'pm-cash', code: 'cash', kind: 'cash', label: 'Espèces', is_active: true, position: 0 },
  { id: 'pm-card', code: 'card', kind: 'card', label: 'Carte bancaire', is_active: true, position: 1 },
  { id: 'pm-deferred', code: 'deferred', kind: 'deferred', label: 'En compte', is_active: true, position: 2 },
  { id: 'pm-link', code: 'payment_link', kind: 'payment_link', label: 'Lien de paiement Stripe', is_active: true, position: 3 },
];

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).startsWith('/api/payment-methods')) {
      return { ok: true, json: async () => ({ methods: METHODS }) } as unknown as Response;
    }
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('PaymentModal — Carte bancaire toujours proposée', () => {
  it('encaissement normal : Carte bancaire est présente', async () => {
    stubFetch();
    render(<PaymentModal saleId="s1" totalTtc={20} onClose={vi.fn()} onValidated={vi.fn()} />);
    await waitFor(() => screen.getByText('Carte bancaire'));
  });

  it('règlement de solde (settlement) : Carte bancaire reste présente, seul "En compte"/"Lien" disparaît', async () => {
    stubFetch();
    render(
      <PaymentModal
        saleId="s1" totalTtc={20} onClose={vi.fn()} onValidated={vi.fn()}
        settlement={{ customerId: 'c1' }}
      />,
    );
    await waitFor(() => screen.getByText('Carte bancaire'));
    expect(screen.queryByText('En compte')).toBeNull();
    expect(screen.queryByText('Lien de paiement Stripe')).toBeNull();
  });

  it('encaissement combiné à un solde dû (accountSettlement) : Carte bancaire reste présente', async () => {
    stubFetch();
    render(
      <PaymentModal
        saleId="s1" totalTtc={50} onClose={vi.fn()} onValidated={vi.fn()}
        accountSettlement={{ customerId: 'c1', amount: 30 }}
      />,
    );
    await waitFor(() => screen.getByText('Carte bancaire'));
  });
});
