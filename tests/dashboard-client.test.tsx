// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, cleanup, within } from '@testing-library/react';
import DashboardClient from '@/app/(app)/dashboard/DashboardClient';

/**
 * Tableau de bord : ce qu'il montre de ce que l'API calcule.
 *
 * Deux choses s'y jouaient mal.
 *
 * La ventilation de TVA était calculée par la route et jetée : la page n'en
 * affichait que le total, et occupait la place par un demi-camembert d'une
 * seule part, « Sur place », valant toujours 100 %. Une part unique ne compare
 * rien ; le détail par taux, lui, est ce qu'on recopie sur la déclaration.
 *
 * L'évolution, elle, confondait deux situations : « pas encore chargé » et
 * « rien à comparer ». Quand la période équivalente de l'an dernier vaut zéro,
 * aucun pourcentage n'est calculable — le coin de la tuile restait vide, et on
 * ne savait pas si le chiffre manquait ou s'il n'y avait pas de base.
 */

const TVA = [
  { rate: 20, base_ht: 741.92, tva: 148.38, ttc: 890.3 },
  { rate: 5.5, base_ht: 100, tva: 5.5, ttc: 105.5 },
];

const KPI_VIDE = {
  ca_ttc: 0, ca_ht: 0, tva: 0, tickets: 0, customers: 0, marge: 0, avg_ttc: 0, avg_ht: 0,
};

/** Réponse fidèle à la forme de /api/analytics/dashboard. */
function payload(prev = KPI_VIDE) {
  return {
    period: { from: '2026-01-01', to: '2026-08-12' },
    periodLabel: '1 janv. 2026 - 12 août 2026',
    prevLabel: '1 janv. 2025 - 12 août 2025',
    summary: {
      current: {
        ca_ttc: 890.3, ca_ht: 741.92, tva: 148.38, tickets: 11,
        customers: 1, marge: 741.92, avg_ttc: 80.94, avg_ht: 67.45,
      },
      prev,
    },
    daily: {
      labels: ['jeu. 1'], ca_ttc: [890.3], ca_ht: [741.92],
      ticket_ttc: [80.94], ticket_ht: [67.45], marge: [741.92],
      prev_ca_ttc: [0], prev_ca_ht: [0],
      prev_ticket_ttc: [0], prev_ticket_ht: [0], prev_marge: [0],
    },
    hourly: [{ hour: 10, ca_ttc: 890.3, ca_ht: 741.92, prev_ca_ttc: 0, prev_ca_ht: 0 }],
    weekday: [{ dow: 3, label: 'Mercredi', ca_ttc: 890.3, ca_ht: 741.92, prev_ca_ttc: 0, prev_ca_ht: 0 }],
    payments: [{ method: 'card', label: 'Carte Bancaire', amount: 387.8 }],
    tva: TVA,
    products: [{ label: 'Bouquet champêtre', qty: 2, ca_ttc: 120, ca_ht: 100 }],
  };
}

async function mount(corps: unknown = payload()) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, json: async () => corps,
  } as unknown as Response)));
  render(<DashboardClient firstName="Camille" stores={[]} />);
  await act(async () => { await Promise.resolve(); });
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/**
 * La tuile d'indicateur portant ce libellé.
 *
 * Le libellé apparaît deux fois sur la page — sur la tuile ET sur le titre du
 * graphique correspondant. Seule la tuile écrit son libellé en capitales, ce
 * qui la distingue sans dépendre de l'ordre des cartes.
 */
function tuileKpi(label: string): HTMLElement {
  const el = screen.getAllByText(label).find((d) => d.className.includes('uppercase'));
  if (!el) throw new Error(`Aucune tuile « ${label} »`);
  return el.closest('.card') as HTMLElement;
}

/** Le tableau de la carte TVA, reconnu à sa ligne de taux. */
function tableTva(): HTMLElement {
  const t = screen.getAllByRole('table').find((x) => within(x).queryByText('20 %'));
  if (!t) throw new Error('Aucun tableau de TVA');
  return t;
}

describe('TVA collectée', () => {
  beforeEach(async () => { await mount(); });

  it('détaille chaque taux présent sur la période', () => {
    // Une ligne par taux réellement vendu, dans le même tableau : une boutique
    // qui ajoute un taux le voit apparaître sans qu'on touche au code.
    const table = tableTva();
    expect(within(table).getByText('20 %')).toBeTruthy();
    expect(within(table).getByText('5.5 %')).toBeTruthy();
  });

  it('donne la base H.T., la taxe et le TTC de chaque taux', () => {
    const texte = tableTva().textContent ?? '';
    expect(texte).toContain('741,92');   // base H.T.
    expect(texte).toContain('148,38');   // TVA
    expect(texte).toContain('890,30');   // TTC
  });

  it('ne montre plus le camembert à une seule part', () => {
    // « CA par mode de vente » n'avait qu'une part, « Sur place », toujours à
    // 100 % : un graphique qui ne pouvait rien apprendre.
    expect(screen.queryByText(/mode de vente/i)).toBeNull();
    expect(screen.queryByText(/Sur place/i)).toBeNull();
  });
});

describe('Évolution sur la période comparée', () => {
  it('affiche un tiret quand l\'an dernier est vide, pas un coin vide', async () => {
    await mount(payload(KPI_VIDE));
    const tuile = tuileKpi("Chiffre d'affaires TTC");
    expect(within(tuile).getByTitle(/Rien à comparer/)).toBeTruthy();
    expect(within(tuile).getByText('—')).toBeTruthy();
  });

  it('calcule le pourcentage dès qu\'il y a une base', async () => {
    await mount(payload({ ...KPI_VIDE, ca_ttc: 445.15, ca_ht: 370.96 }));
    const tuile = tuileKpi("Chiffre d'affaires TTC");
    // 890,30 contre 445,15 : le double, soit +100 %.
    expect(within(tuile).getByText(/↑ 100%/)).toBeTruthy();
    // Et plus de tiret « rien à comparer » sur cette tuile.
    expect(within(tuile).queryByTitle(/Rien à comparer/)).toBeNull();
  });
});
