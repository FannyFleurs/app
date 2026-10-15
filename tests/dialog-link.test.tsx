// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import DialogHost, { alertThemed } from '@/lib/ui/dialog';

/**
 * Alerte thémée avec lien (ex. lien de paiement Stripe non envoyé par
 * email) : le lien dépassait de la boîte (texte brut injecté dans le
 * message, sans retour à la ligne forcé pour une longue chaîne sans
 * espaces) — repli vers un encart dédié qui renvoie à la ligne plutôt que
 * de déborder, avec un bouton Copier explicite.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const LONG_URL = 'https://checkout.stripe.com/c/pay/cs_live_a1QBeCvJA6l4wftgEBVNGHGGYxugj1RWEOwTsfHt1goCsCcPmhd8FEN3Ma';

describe('alertThemed avec lien', () => {
  it("affiche le lien dans un encart à part (jamais injecté brut dans le texte du message), avec retour à la ligne forcé", async () => {
    render(<DialogHost />);
    void alertThemed({ message: 'Lien de paiement créé :', link: LONG_URL });

    await waitFor(() => expect(screen.getByText('Lien de paiement créé :')).toBeTruthy());
    const linkBox = screen.getByText(LONG_URL);
    expect(linkBox.className).toContain('break-all');
    // Le lien ne fait pas partie du texte du message lui-même.
    expect(screen.getByText('Lien de paiement créé :').textContent).not.toContain('https://');
    fireEvent.click(screen.getByText('OK'));
  });

  it('copie le lien au clic sur Copier et affiche une confirmation', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    render(<DialogHost />);
    void alertThemed({ message: 'Lien créé :', link: LONG_URL });

    await waitFor(() => expect(screen.getByText('Copier')).toBeTruthy());
    fireEvent.click(screen.getByText('Copier'));

    expect(writeText).toHaveBeenCalledWith(LONG_URL);
    await waitFor(() => expect(screen.getByText('✓ Copié')).toBeTruthy());
    fireEvent.click(screen.getByText('OK'));
  });

  it("sans lien, n'affiche aucun encart ni bouton Copier (comportement inchangé pour les alertes simples)", async () => {
    render(<DialogHost />);
    void alertThemed({ message: 'Mot de passe réinitialisé.' });

    await waitFor(() => expect(screen.getByText('Mot de passe réinitialisé.')).toBeTruthy());
    expect(screen.queryByText('Copier')).toBeNull();
  });
});
