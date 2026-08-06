// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import ReportsClient from '@/app/(app)/reports/ReportsClient';

/**
 * Navigation entre les six rapports du back-office.
 *
 * Chaque rapport a ses propres colonnes et donc sa propre forme de données :
 * « Ventes » renvoie des jours, les cinq autres des lignes. Le piège est le
 * changement d'onglet — l'onglet bascule immédiatement, la requête non. Si le
 * jeu de données précédent restait affiché pendant ce laps de temps, le
 * tableau du nouveau rapport lirait des colonnes absentes et l'écran entier
 * tomberait sur la frontière d'erreur. Ces tests parcourent donc tous les
 * enchaînements d'onglets, dans les deux sens.
 */

/** Réponses minimales mais fidèles à la forme réelle de chaque route. */
const PAYLOADS: Record<string, unknown> = {
  sales: {
    days: [{
      day: '2026-08-05', tickets: 3, ht: 100, tva: 20, ttc: 120, discount: 0,
      margin: 40, credit_notes: 0, vat: { '20.00': { base_ht: 100, tva: 20 } },
      payments: { cash: 120 },
    }],
    rates: ['20.00'], methods: ['cash'],
    totals: {
      tickets: 3, ht: 100, tva: 20, ttc: 120, discount: 0, margin: 40,
      credit_notes: 0, vat: { '20.00': { base_ht: 100, tva: 20 } }, payments: { cash: 120 },
    },
  },
  'sale-lines': {
    lines: [{
      label: 'Rose Avalanche', sku: 'REF-A', barcode: null, category: 'Fleurs',
      quantity: 5, ht: 50, tva: 10, ttc: 60, discount: 0, margin: 20,
    }],
    totals: { quantity: 5, ht: 50, tva: 10, ttc: 60, discount: 0, margin: 20 },
  },
  'customer-debts': {
    lines: [{
      sale_id: 'v1', receipt: 'T-1', date: '2026-08-05T10:00:00Z', seller: 'Fanny',
      customer: 'Mairie', store: 'Plante Verte', ht: 80, ttc: 96, deferred: 96, balance: 96,
    }],
    totals: { count: 1, ht: 80, ttc: 96, deferred: 96 },
  },
  refunds: {
    lines: [{
      id: 'a1', date: '2026-08-05T11:00:00Z', number: 'AV-1', receipt: 'T-2',
      seller: 'Fanny', customer: null, store: 'Plante Verte',
      kind: 'return', reason: 'Retour marchandise', amount: 12,
    }],
    totals: { count: 1, amount: 12, cancellations: 0, returns: 12 },
  },
  cancellations: {
    lines: [{
      id: 'v2', date: '2026-08-05T12:00:00Z', cancelled_at: '2026-08-05T12:05:00Z',
      receipt: 'T-3', seller: 'Fanny', customer: null, store: 'Plante Verte',
      ht: 2, ttc: 2, reason: 'Annulation',
    }],
    totals: { count: 1, ht: 2, ttc: 2 },
  },
  vouchers: {
    lines: [{
      id: 'g1', date: '2026-08-05T13:00:00Z', type: 'gift_card', reference: 'GC-1',
      customer: 'Mairie', amount: 50, remaining: 50, expires_at: null, status: 'active',
    }],
    totals: { count: 1, amount: 50, remaining: 50 },
  },
};

const TABS = [
  'Ventes', 'Lignes de vente', 'Dettes clients',
  'Remboursements', 'Annulations', 'Avoirs / Bons cadeaux',
] as const;

let calls: string[] = [];

beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const endpoint = url.replace('/api/reports/', '').split('?')[0]!;
    calls.push(endpoint);
    return {
      ok: true,
      json: async () => PAYLOADS[endpoint] ?? {},
    } as unknown as Response;
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Clique un onglet et laisse la requête se résoudre. */
async function openTab(label: string) {
  fireEvent.click(screen.getByRole('button', { name: label }));
  await act(async () => { await Promise.resolve(); });
}

async function mount() {
  render(<ReportsClient stores={[]} />);
  await act(async () => { await Promise.resolve(); });
}

describe('Rapports du back-office', () => {
  it('affiche le rapport des ventes au premier rendu', async () => {
    await mount();
    expect(calls).toEqual(['sales']);
    expect(screen.getByRole('heading', { name: 'Ventes' })).toBeTruthy();
    expect(screen.getByText('Tickets')).toBeTruthy();
  });

  it('ouvre chacun des cinq autres rapports depuis les ventes', async () => {
    // Le chemin exact du bug signalé : on part toujours des ventes, dont la
    // forme (des jours) n'a aucune colonne en commun avec les autres.
    for (const tab of TABS.slice(1)) {
      await mount();
      await openTab(tab);
      expect(screen.getByRole('heading', { name: tab })).toBeTruthy();
      expect(screen.queryByText(/Rien à afficher/)).toBeNull();
      cleanup();
    }
  });

  it('enchaîne les six rapports dans les deux sens sans planter', async () => {
    await mount();
    for (const tab of [...TABS.slice(1), ...[...TABS].reverse()]) {
      await openTab(tab);
      expect(screen.getByRole('heading', { name: tab })).toBeTruthy();
    }
    expect(calls[calls.length - 1]).toBe('sales');
  });

  it("n'affiche jamais les données d'un rapport sous l'entête d'un autre", async () => {
    // Requête laissée en suspens : l'onglet a basculé, la donnée n'est pas
    // encore là. L'écran doit annoncer un chargement, pas peindre l'ancien
    // rapport dans les colonnes du nouveau.
    await mount();
    let release: (() => void) | null = null;
    vi.stubGlobal('fetch', vi.fn(async () => {
      await new Promise<void>((r) => { release = r; });
      return { ok: true, json: async () => PAYLOADS['sale-lines'] } as unknown as Response;
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Lignes de vente' }));
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByRole('heading', { name: 'Lignes de vente' })).toBeTruthy();
    expect(screen.getByText('Chargement…')).toBeTruthy();
    // Aucune colonne du rapport des ventes ne subsiste.
    expect(screen.queryByText('Tickets')).toBeNull();

    await act(async () => { release?.(); await Promise.resolve(); });
    expect(screen.getByText('Rose Avalanche')).toBeTruthy();
  });

  it('ignore une réponse tardive appartenant à un onglet quitté', async () => {
    await mount();
    const resolvers: Array<() => void> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const endpoint = url.replace('/api/reports/', '').split('?')[0]!;
      await new Promise<void>((r) => { resolvers.push(r); });
      return { ok: true, json: async () => PAYLOADS[endpoint] } as unknown as Response;
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Lignes de vente' }));
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole('button', { name: 'Annulations' }));
    await act(async () => { await Promise.resolve(); });

    // La seconde requête répond d'abord, la première ensuite : l'écran doit
    // rester sur les annulations.
    await act(async () => { resolvers[1]?.(); await Promise.resolve(); });
    await act(async () => { resolvers[0]?.(); await Promise.resolve(); });

    expect(screen.getByRole('heading', { name: 'Annulations' })).toBeTruthy();
    expect(screen.queryByText('Rose Avalanche')).toBeNull();
  });
});
