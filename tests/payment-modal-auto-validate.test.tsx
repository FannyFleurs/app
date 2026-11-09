// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import PaymentModal from '@/app/(app)/caisse/PaymentModal';

/**
 * Remontée : sélectionner le(s) mode(s) de règlement exigeait un clic
 * supplémentaire sur « Valider ». L'encaissement doit désormais se
 * déclencher automatiquement dès que le montant saisi couvre le total —
 * aucun bouton « Valider » ne doit plus exister sur le chemin heureux ; un
 * échec affiche une action « Réessayer » explicite (pas de retour silencieux
 * à un état sans action possible).
 */

const METHODS = [
  { id: 'pm-cash', code: 'cash', kind: 'cash', label: 'Espèces', is_active: true, position: 0, opens_drawer: true },
  { id: 'pm-card', code: 'card', kind: 'card', label: 'Carte bancaire', is_active: true, position: 1, opens_drawer: false },
];

let validateCalls: Array<Record<string, unknown>>;
let validateShouldFail: boolean;

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).startsWith('/api/payment-methods')) {
      return { ok: true, json: async () => ({ methods: METHODS }) } as unknown as Response;
    }
    if (String(url).includes('/validate') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      validateCalls.push(body);
      if (validateShouldFail) {
        return { ok: false, status: 409, json: async () => ({ error: 'PAYMENTS_MISMATCH' }) } as unknown as Response;
      }
      return { ok: true, json: async () => ({ receipt_id: 'r1', receipt_number: 'T-0001', loyalty: null, gift_cards_issued: [] }) } as unknown as Response;
    }
    throw new Error(`requête non simulée dans le test : ${url}`);
  }));
}

beforeEach(() => {
  validateCalls = [];
  validateShouldFail = false;
  stubFetch();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function mount(onValidated = vi.fn()) {
  const onClose = vi.fn();
  render(
    <PaymentModal
      saleId="sale-1"
      totalTtc={20}
      lines={[{ label: 'Bouquet', quantity: 1, unit_price_ttc: 20, discount_amount: 0 }]}
      onClose={onClose}
      onValidated={onValidated}
    />,
  );
  return { onClose, onValidated };
}

describe('PaymentModal — plus de bouton « Valider » sur le chemin heureux', () => {
  it("n'affiche aucun bouton « Valider » à aucun moment du parcours", async () => {
    mount();
    await waitFor(() => screen.getByText('Carte bancaire'));
    expect(screen.queryByText(/^Valider/)).toBeNull();
    fireEvent.click(screen.getByText('Carte bancaire'));
    await waitFor(() => expect(validateCalls.length).toBe(1));
    expect(screen.queryByText(/^Valider/)).toBeNull();
  });

  it("taper un mode qui couvre tout le montant valide automatiquement, sans clic supplémentaire", async () => {
    const { onValidated } = mount();
    await waitFor(() => screen.getByText('Carte bancaire'));
    fireEvent.click(screen.getByText('Carte bancaire'));
    await waitFor(() => expect(onValidated).toHaveBeenCalledWith('r1', 'T-0001', null, [], 0));
    expect(validateCalls[0]!.payments).toEqual([{ method: 'card', amount: 20, given_amount: undefined, reference: undefined, label: 'Carte bancaire' }]);
  });

  it("un paiement partiel n'encaisse pas tant que le montant n'est pas couvert, puis valide automatiquement au second mode", async () => {
    const { onValidated } = mount();
    await waitFor(() => screen.getByText('Espèces'));

    // Pavé numérique : 12, puis Espèces → alloue 12 €, reste 8 €.
    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('2'));
    fireEvent.click(screen.getByText('Espèces'));
    await new Promise((r) => setTimeout(r, 30));
    expect(validateCalls.length).toBe(0);
    expect(onValidated).not.toHaveBeenCalled();
    expect(screen.getByText(/Reste à régler/)).toBeTruthy();

    // Carte pour le reste (8 €, rien tapé = tout le restant) → doit couvrir
    // exactement le total et déclencher la validation automatiquement.
    fireEvent.click(screen.getByText('Carte bancaire'));
    await waitFor(() => expect(onValidated).toHaveBeenCalledTimes(1));
    expect(validateCalls[0]!.payments).toEqual([
      { method: 'cash', amount: 12, given_amount: undefined, reference: undefined, label: 'Espèces' },
      { method: 'card', amount: 8, given_amount: undefined, reference: undefined, label: 'Carte bancaire' },
    ]);
  });
});

describe('PaymentModal — échec de validation', () => {
  it('affiche "Réessayer" au lieu de rester bloqué sans action possible', async () => {
    validateShouldFail = true;
    const { onValidated } = mount();
    await waitFor(() => screen.getByText('Carte bancaire'));
    fireEvent.click(screen.getByText('Carte bancaire'));
    await waitFor(() => expect(validateCalls.length).toBe(1));
    expect(onValidated).not.toHaveBeenCalled();
    await waitFor(() => screen.getByText(/Réessayer/));
  });

  it('cliquer sur "Réessayer" retente la même validation', async () => {
    validateShouldFail = true;
    mount();
    await waitFor(() => screen.getByText('Carte bancaire'));
    fireEvent.click(screen.getByText('Carte bancaire'));
    await waitFor(() => screen.getByText(/Réessayer/));

    validateShouldFail = false;
    fireEvent.click(screen.getByText(/Réessayer/));
    await waitFor(() => expect(validateCalls.length).toBe(2));
  });
});
