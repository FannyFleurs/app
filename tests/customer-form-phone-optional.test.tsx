// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import CustomerFormModal from '@/components/CustomerFormModal';

/**
 * Le téléphone était obligatoire sur la fiche client (vérification côté UI
 * uniquement — zod et la base l'ont toujours accepté nul). Beaucoup de
 * clients ne communiquent pas de téléphone ; la fiche doit pouvoir
 * s'enregistrer sans.
 */
function fill(label: string, value: string) {
  const el = screen.getByText(label).parentElement!.querySelector('input') as HTMLInputElement;
  fireEvent.change(el, { target: { value } });
}

let posted: { url: string; body: unknown }[] = [];

beforeEach(() => {
  posted = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posted.push({ url, body: init.body ? JSON.parse(String(init.body)) : null });
      return { ok: true, json: async () => ({ id: 'new-1' }) } as unknown as Response;
    }
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Fiche client — téléphone non obligatoire', () => {
  it('enregistre un particulier sans téléphone (nom/prénom seuls requis)', async () => {
    const onSaved = vi.fn();
    render(<CustomerFormModal customer={null} onClose={() => {}} onSaved={onSaved} />);

    fill('Prénom *', 'Marie');
    fill('Nom *', 'Dupont');
    // Téléphone laissé vide volontairement.

    fireEvent.click(screen.getByText('Créer le client'));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.url).toBe('/api/customers');
    expect((posted[0]!.body as { phone: string | null }).phone).toBeNull();
    expect(screen.queryByText('Téléphone obligatoire.')).toBeNull();
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('new-1'));
  });

  it('le libellé du champ n\'affiche plus d\'astérisque (non obligatoire)', () => {
    render(<CustomerFormModal customer={null} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByText('Téléphone')).toBeTruthy();
    expect(screen.queryByText('Téléphone *')).toBeNull();
  });

  it('un particulier sans prénom/nom reste bloqué (validation identité inchangée)', async () => {
    render(<CustomerFormModal customer={null} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByText('Créer le client'));
    await waitFor(() => expect(screen.getByText('Prénom et nom obligatoires.')).toBeTruthy());
    expect(posted).toHaveLength(0);
  });
});
