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

/** Bornes de la dernière requête émise, telles que lues dans l'URL. */
function lastRange(): { from: string; to: string } {
  const url = (fetch as unknown as { mock: { calls: string[][] } }).mock.calls.at(-1)![0]!;
  const qs = new URLSearchParams(url.split('?')[1]);
  return { from: qs.get('from')!, to: qs.get('to')! };
}

describe('Périodes courantes', () => {
  // Un mardi : le lundi de la semaine n'est pas le jour même, et le mois
  // précédent a 31 jours — deux calculs qu'un jeudi ne testerait pas.
  const TUESDAY = new Date(2026, 6, 7, 15, 30); // mardi 7 juillet 2026

  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(TUESDAY); });
  afterEach(() => { vi.useRealTimers(); });

  async function pick(label: string) {
    fireEvent.click(screen.getByRole('button', { name: label }));
    await act(async () => { await Promise.resolve(); });
  }

  it('interroge la période demandée, bornes de calendrier comprises', async () => {
    await mount();

    await pick('Semaine en cours');
    expect(lastRange()).toEqual({ from: '2026-07-06', to: '2026-07-07' });

    await pick('Semaine précédente');
    expect(lastRange()).toEqual({ from: '2026-06-29', to: '2026-07-05' });

    await pick('Mois en cours');
    expect(lastRange()).toEqual({ from: '2026-07-01', to: '2026-07-07' });

    await pick('Mois précédent');
    expect(lastRange()).toEqual({ from: '2026-06-01', to: '2026-06-30' });

    await pick('Depuis une semaine');
    expect(lastRange()).toEqual({ from: '2026-06-30', to: '2026-07-07' });

    await pick('Depuis un mois');
    expect(lastRange()).toEqual({ from: '2026-06-07', to: '2026-07-07' });

    await pick('Année en cours');
    expect(lastRange()).toEqual({ from: '2026-01-01', to: '2026-07-07' });

    await pick('Depuis un an');
    expect(lastRange()).toEqual({ from: '2025-07-07', to: '2026-07-07' });
  });

  it('signale la période active et ne la perd pas en changeant de rapport', async () => {
    await mount();
    await pick('Mois en cours');
    expect(screen.getByRole('button', { name: 'Mois en cours' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Annulations' }));
    await act(async () => { await Promise.resolve(); });

    expect(lastRange()).toEqual({ from: '2026-07-01', to: '2026-07-07' });
    expect(screen.getByRole('button', { name: 'Mois en cours' }).getAttribute('aria-pressed')).toBe('true');
  });

  it("n'allume aucune période après une saisie manuelle des dates", async () => {
    await mount();
    await pick('Mois en cours');

    const [fromInput] = document.querySelectorAll('input[type="date"]');
    await act(async () => {
      fireEvent.change(fromInput!, { target: { value: '2026-07-03' } });
      await Promise.resolve();
    });

    for (const p of ['Mois en cours', 'Semaine en cours', 'Année en cours']) {
      expect(screen.getByRole('button', { name: p }).getAttribute('aria-pressed')).toBe('false');
    }
  });

  it('ouvre sur le mois écoulé', async () => {
    await mount();
    expect(lastRange()).toEqual({ from: '2026-06-07', to: '2026-07-07' });
    expect(screen.getByRole('button', { name: 'Depuis un mois' }).getAttribute('aria-pressed')).toBe('true');
  });
});

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
