// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import SalesAccountsSection from '@/app/(app)/exports/SalesAccountsSection';

/**
 * Formulaire des comptes de ventes, côté comptable.
 *
 * Deux exigences qui se sont révélées à l'usage :
 *  - le comptable doit pouvoir rattacher un compte à UNE boutique. Les listes
 *    venaient de /api/stores et /api/categories, réservées à des permissions
 *    qu'il n'a pas : ses menus déroulants restaient vides et la règle ne
 *    pouvait porter que sur « Toutes ».
 *  - le compte de TVA est l'exception, pas la règle : ses deux champs ne
 *    s'affichent que si on le demande.
 */

const STORES = [
  { id: 's1', name: 'Fanny Fleurs Alençon' },
  { id: 's2', name: 'Fanny Fleurs Mortagne' },
];
const CATEGORIES = [{ id: 'c1', name: 'Plantes vertes' }];

/** Deux croisements vendus : l'un couvert par une règle, l'autre non. */
const CROSSINGS = [
  { store_id: 's2', store_name: 'Fanny Fleurs Mortagne', category_id: 'c1',
    category_name: 'Plantes vertes', vat_rate: 20, ht: 200, account_code: null },
  { store_id: 's1', store_name: 'Fanny Fleurs Alençon', category_id: 'c1',
    category_name: 'Plantes vertes', vat_rate: 10, ht: 50, account_code: '70731200' },
];

let posted: Array<{ url: string; body: Record<string, unknown> }> = [];

beforeEach(() => {
  posted = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posted.push({ url, body: JSON.parse(String(init.body)) });
      return { ok: true, json: async () => ({ id: 'new' }) } as unknown as Response;
    }
    if (url.startsWith('/api/accounting/references')) {
      return { ok: true, json: async () => ({ stores: STORES, categories: CATEGORIES }) } as unknown as Response;
    }
    if (url.startsWith('/api/accounting/coverage')) {
      return { ok: true, json: async () => ({ crossings: CROSSINGS }) } as unknown as Response;
    }
    if (url.startsWith('/api/settings/accounting-accounts')) {
      return { ok: true, json: async () => ({ accounts: [] }) } as unknown as Response;
    }
    return { ok: false, json: async () => ({}) } as unknown as Response;
  }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** Champ du formulaire, repéré par son intitulé. */
function champ(label: string): HTMLInputElement | HTMLSelectElement {
  const lab = screen.getAllByText(label).find((e) => e.tagName === 'LABEL')!;
  return lab.parentElement!.querySelector('input, select')!;
}

async function ouvrirFormulaire() {
  render(<SalesAccountsSection canEdit />);
  await waitFor(() => screen.getByText('+ Créer le premier'));
  fireEvent.click(screen.getByText('+ Créer le premier'));
  await waitFor(() => screen.getByText('Nouveau compte'));
}

describe('Comptes de ventes — formulaire', () => {
  it('propose les boutiques et les familles au comptable', async () => {
    await ouvrirFormulaire();

    const boutiques = [...(champ('Boutique') as HTMLSelectElement).options].map((o) => o.textContent);
    expect(boutiques).toEqual(['Toutes', 'Fanny Fleurs Alençon', 'Fanny Fleurs Mortagne']);

    const familles = [...(champ('Famille de produit') as HTMLSelectElement).options].map((o) => o.textContent);
    expect(familles).toEqual(['Toutes', 'Plantes vertes']);
  });

  it('interroge la route comptable, pas celles du catalogue', async () => {
    // /api/stores et /api/categories renverraient 403 au comptable : les
    // solliciter reviendrait à lui promettre des listes qui resteront vides.
    await ouvrirFormulaire();
    const appels = (fetch as unknown as { mock: { calls: string[][] } }).mock.calls
      .map((c) => c[0] ?? '');
    expect(appels).toContain('/api/accounting/references');
    expect(appels.some((u) => u.startsWith('/api/stores'))).toBe(false);
    expect(appels.some((u) => u.startsWith('/api/categories'))).toBe(false);
  });

  it('enregistre la boutique choisie', async () => {
    await ouvrirFormulaire();
    fireEvent.change(champ('N° de compte'), { target: { value: '70731200' } });
    fireEvent.change(champ('Libellé'), { target: { value: 'PLANTES 10% MORTAGNE' } });
    fireEvent.change(champ('Boutique'), { target: { value: 's2' } });
    fireEvent.click(screen.getByText('Créer'));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.body).toMatchObject({ store_id: 's2', account_code: '70731200' });
  });

  it('masque les champs de TVA tant qu\'on n\'en demande pas', async () => {
    await ouvrirFormulaire();
    expect(screen.queryByText('Compte de TVA collectée')).toBeNull();
    expect(screen.queryByText('Libellé du compte de TVA')).toBeNull();

    fireEvent.click(screen.getByLabelText('Ajouter un compte de TVA collectée'));
    expect(screen.getByText('Compte de TVA collectée')).toBeTruthy();
    expect(screen.getByText('Libellé du compte de TVA')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Ajouter un compte de TVA collectée'));
    expect(screen.queryByText('Compte de TVA collectée')).toBeNull();
  });

  it('ne pré-remplit rien sur un « Nouveau compte » ordinaire', async () => {
    // Le formulaire ouvert depuis un croisement garde son pré-remplissage tant
    // qu'il est ouvert ; celui ouvert « à blanc » ne doit pas en hériter.
    await ouvrirFormulaire();
    expect((champ('Boutique') as HTMLSelectElement).value).toBe('');
    expect((champ('Libellé') as HTMLInputElement).value).toBe('');
  });

  it('n\'enregistre pas un compte de TVA saisi puis abandonné', async () => {
    // La case fait foi : si elle est décochée, ce qu'elle masque ne part pas.
    await ouvrirFormulaire();
    fireEvent.change(champ('N° de compte'), { target: { value: '70731200' } });
    fireEvent.change(champ('Libellé'), { target: { value: 'PLANTES 10%' } });

    const case_ = screen.getByLabelText('Ajouter un compte de TVA collectée');
    fireEvent.click(case_);
    fireEvent.change(champ('Compte de TVA collectée'), { target: { value: '44571200' } });
    fireEvent.click(case_);

    fireEvent.click(screen.getByText('Créer'));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.body).toMatchObject({ vat_account_code: null, vat_account_label: null });
  });
});

describe('Croisements vendus sans compte', () => {
  it('ne liste que ceux qui n\'ont pas de règle', async () => {
    render(<SalesAccountsSection canEdit />);
    await waitFor(() => screen.getByText(/croisement sans compte/));
    // Le croisement déjà couvert n'a rien à faire dans une liste de manques.
    // Le décompte est suivi d'une consigne dans le même paragraphe : on lit donc
    // en « contient », pas en égalité stricte.
    expect(screen.getByText(/1 croisement sans compte · 1 déjà couvert/)).toBeTruthy();
    // Une seule ligne, celle du croisement non couvert. (Les noms de boutique
    // apparaissent aussi dans les filtres : on lit donc le tableau.) La dernière
    // cellule porte les deux actions : voir le détail, et créer le compte.
    const lignes = [...document.querySelectorAll('tbody tr')]
      .map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent));
    expect(lignes).toEqual([
      ['Plantes vertes', '20 %', 'Fanny Fleurs Mortagne', '200.00 €', 'Voir le détailCréer le compte'],
    ]);
  });

  it('ouvre le formulaire pré-rempli sur le croisement', async () => {
    render(<SalesAccountsSection canEdit />);
    await waitFor(() => screen.getByText('Créer le compte'));
    fireEvent.click(screen.getByText('Créer le compte'));
    await waitFor(() => screen.getByText('Nouveau compte'));

    expect((champ('Boutique') as HTMLSelectElement).value).toBe('s2');
    expect((champ('Famille de produit') as HTMLSelectElement).value).toBe('c1');
    expect((champ('Taux de TVA (%)') as HTMLInputElement).value).toBe('20');
    // Le libellé suit la convention du plan comptable ; le numéro, lui, ne
    // s'invente pas et reste à saisir.
    expect((champ('Libellé') as HTMLInputElement).value)
      .toBe('PLANTES VERTES 20% FANNY FLEURS MORTAGNE');
    expect((champ('N° de compte') as HTMLInputElement).value).toBe('');
  });

  it('félicite plutôt que d\'afficher une liste vide', async () => {
    (fetch as unknown as { mockImplementation: (f: unknown) => void }).mockImplementation(
      async (url: string) => {
        if (url.startsWith('/api/accounting/coverage')) {
          return { ok: true, json: async () => ({ crossings: [CROSSINGS[1]] }) } as unknown as Response;
        }
        if (url.startsWith('/api/accounting/references')) {
          return { ok: true, json: async () => ({ stores: STORES, categories: CATEGORIES }) } as unknown as Response;
        }
        return { ok: true, json: async () => ({ accounts: [] }) } as unknown as Response;
      });
    render(<SalesAccountsSection canEdit />);
    await waitFor(() => screen.getByText(/ont tous un compte/));
  });
});
