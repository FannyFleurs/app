// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import CustomerPickerModal from '@/app/(app)/caisse/CustomerPickerModal';
import {
  activateSchoolMode, deactivateSchoolMode, addSchoolCustomer,
  schoolCustomers, isSchoolCustomerId,
} from '@/lib/school-mode';

/**
 * Client rattaché à la vente en mode école.
 *
 * Le mode école doit pouvoir dérouler une vente de bout en bout — client
 * compris — sans rien écrire côté serveur. Deux exigences en tension : la
 * démonstration doit être complète, et le fichier clients de la boutique doit
 * rester intact. Les vrais clients sont donc lisibles et sélectionnables, mais
 * une fiche créée pendant une démonstration ne vit qu'ici.
 */

/** Saisit un champ du formulaire client, repéré par son intitulé. */
function fill(label: string, value: string) {
  const el = screen.getByText(label).parentElement!.querySelector('input') as HTMLInputElement;
  fireEvent.change(el, { target: { value } });
}

let posted: string[] = [];

beforeEach(() => {
  posted = [];
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') posted.push(`${init.method} ${url}`);
    if (url.startsWith('/api/customers')) {
      return { ok: true, json: async () => ({ customers: [], id: 'real-1' }) } as unknown as Response;
    }
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('Fiches clients du mode école', () => {
  it('garde les fiches de démonstration en local et les efface avec le mode', () => {
    activateSchoolMode();
    const c = addSchoolCustomer({
      display_name: 'Mairie de démonstration', type: 'collectivite',
      email: null, phone: '0600000000', company_name: 'Mairie de démonstration',
      default_discount_pct: 10,
    });

    expect(isSchoolCustomerId(c.id)).toBe(true);
    expect(schoolCustomers()).toHaveLength(1);

    // Sortir du mode école ne laisse aucune trace de la démonstration.
    deactivateSchoolMode();
    expect(schoolCustomers()).toHaveLength(0);
  });

  it("ne distingue pas un vrai identifiant client d'une fiche de démonstration", () => {
    expect(isSchoolCustomerId('9f1c8e2a-0000-4000-8000-000000000000')).toBe(false);
  });
});

describe('Sélecteur de client en mode école', () => {
  it("crée la fiche localement, sans l'enregistrer côté serveur", async () => {
    activateSchoolMode();
    const onPick = vi.fn();
    render(<CustomerPickerModal onClose={() => {}} onPick={onPick} />);

    fireEvent.click(screen.getByRole('button', { name: '+ Nouveau' }));
    fill('Prénom *', 'Camille');
    fill('Nom *', 'Durand');
    fill('Téléphone *', '0612345678');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Créer le client' }));
    });

    await waitFor(() => expect(onPick).toHaveBeenCalled());
    const picked = onPick.mock.calls[0]![0];
    expect(picked.display_name).toBe('Camille Durand');
    expect(isSchoolCustomerId(picked.id)).toBe(true);
    // Rien n'a été écrit dans le fichier clients de la boutique.
    expect(posted).toEqual([]);
    // La fiche reste disponible pour les ventes suivantes de la démonstration.
    expect(schoolCustomers().map((x) => x.display_name)).toEqual(['Camille Durand']);
  });

  it('propose les fiches de démonstration dans la liste', async () => {
    activateSchoolMode();
    addSchoolCustomer({
      display_name: 'Camille Durand', type: 'particulier',
      email: null, phone: '0612345678', company_name: null, default_discount_pct: null,
    });
    const onPick = vi.fn();
    render(<CustomerPickerModal onClose={() => {}} onPick={onPick} />);

    fireEvent.click(screen.getByRole('button', { name: 'Afficher la liste' }));
    await waitFor(() => expect(screen.getByText('Camille Durand')).toBeTruthy());

    fireEvent.click(screen.getByText('Camille Durand'));
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('enregistre normalement le client hors mode école', async () => {
    const onPick = vi.fn();
    render(<CustomerPickerModal onClose={() => {}} onPick={onPick} />);

    fireEvent.click(screen.getByRole('button', { name: '+ Nouveau' }));
    fill('Prénom *', 'Camille');
    fill('Nom *', 'Durand');
    fill('Téléphone *', '0612345678');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Créer le client' }));
    });

    await waitFor(() => expect(posted).toEqual(['POST /api/customers']));
    expect(schoolCustomers()).toHaveLength(0);
  });
});
