// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import CustomersList from '@/app/(app)/customers/CustomersList';

/**
 * Navigation liste ↔ fiche sur mobile (< md).
 *
 * Avant correction, la grille à deux colonnes s'effondrait en une seule
 * colonne empilée sur mobile : sélectionner un client (sans chercher)
 * n'affichait pas sa fiche à proximité — elle apparaissait tout en bas de
 * la page, après TOUTE la liste des clients (potentiellement plus d'un
 * millier). L'utilisateur devait dérouler toute la liste pour l'atteindre.
 *
 * jsdom n'applique aucune media query (aucun moteur CSS) : on ne peut donc
 * pas vérifier une visibilité "réellement" responsive, mais on peut
 * vérifier ce qui la PRODUIT — les classes `hidden`/`md:flex`/`md:block`
 * qui déterminent, une fois les media queries Tailwind appliquées par un
 * vrai navigateur, quel panneau (liste ou fiche) s'affiche sur un écran
 * étroit — ainsi que le bouton Retour qui permet d'y revenir.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

const CLIENTS = [
  { id: 'c1', type: 'particulier', display_name: 'Guillaume Bode', email: null,
    phone: null, company_name: null, siret: null, nb_sales: '0', last_visit: null,
    total_ttc: '0', loyalty_points: null },
  { id: 'c2', type: 'particulier', display_name: 'Munier Pauline', email: 'pauline@ex.fr',
    phone: null, company_name: null, siret: null, nb_sales: '0', last_visit: null,
    total_ttc: '0', loyalty_points: null },
];

const detail = {
  customer: {
    id: 'c1', type: 'particulier', first_name: 'Guillaume', last_name: 'Bode', company_name: null,
    email: null, phone: null, siret: null, siren: null, vat_number: null,
    public_service_code: null, commitment_number: null, address: null,
    consent_email: true, consent_sms: false, internal_notes: null, loyalty_code: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  sales: [], loyalty_points: 0,
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith('/api/customers/c1')) {
      return { ok: true, json: async () => detail } as unknown as Response;
    }
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function asideEl(container: HTMLElement): HTMLElement {
  return container.querySelector('aside')!;
}
function mainEl(container: HTMLElement): HTMLElement {
  return container.querySelector('main')!;
}
/** Classes Tailwind exactes (jamais une sous-chaîne : "overflow-hidden"
 *  contient "hidden" sans être la classe `hidden`). */
function classes(el: HTMLElement): string[] {
  return el.className.split(/\s+/).filter(Boolean);
}

describe('Clients — bascule liste/fiche sur mobile', () => {
  it("avant sélection : la liste est visible sur mobile, la fiche porte la classe 'hidden' (hors md)", () => {
    const { container } = render(<CustomersList customers={CLIENTS} total={2} canWrite />);
    expect(classes(asideEl(container))).not.toContain('hidden');
    expect(classes(mainEl(container))).toContain('hidden');
    expect(classes(mainEl(container))).toContain('md:block');
  });

  it("après sélection d'un client : la liste passe en 'hidden md:flex', la fiche devient visible", async () => {
    const { container } = render(<CustomersList customers={CLIENTS} total={2} canWrite />);
    fireEvent.click(screen.getByText('Guillaume Bode'));
    await waitFor(() => screen.getByLabelText('Retour à la liste des clients'));

    expect(classes(asideEl(container))).toContain('hidden');
    expect(classes(asideEl(container))).toContain('md:flex');
    expect(classes(mainEl(container))).not.toContain('hidden');
  });

  it("le bouton Retour ramène à la liste (la fiche redevient cachée sur mobile, la liste redevient visible)", async () => {
    const { container } = render(<CustomersList customers={CLIENTS} total={2} canWrite />);
    fireEvent.click(screen.getByText('Guillaume Bode'));
    const backBtn = await waitFor(() => screen.getByLabelText('Retour à la liste des clients'));
    fireEvent.click(backBtn);

    await waitFor(() => expect(classes(asideEl(container))).not.toContain('hidden'));
    expect(classes(mainEl(container))).toContain('hidden');
    expect(screen.getByText('Sélectionnez un client')).toBeTruthy();
  });
});
