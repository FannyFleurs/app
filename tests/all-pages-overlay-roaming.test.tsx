// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import AllPagesOverlay from '@/components/AllPagesOverlay';
import type { Permission } from '@/lib/auth/rbac';
import { writeRoamingChoice } from '@/lib/caisse/roaming';

/**
 * Poste itinérant (`pos.roaming_device`) : le bouton « Changer de boutique »
 * doit être accessible depuis le menu global « Toutes les pages » (pas
 * seulement depuis les écrans de pré-session de la caisse), et uniquement
 * pour les comptes disposant de la permission.
 */

function perms(...list: Permission[]): Set<Permission> {
  return new Set(list);
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) }) as unknown as Response));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('AllPagesOverlay — "Changer de boutique" (pos.roaming_device)', () => {
  it("n'apparaît pas sans la permission pos.roaming_device", () => {
    render(
      <AllPagesOverlay
        role="vendeur" hiddenPaths={[]} permissions={perms()}
        onClose={vi.fn()} onLogout={vi.fn()}
      />,
    );
    expect(screen.queryByText('Changer de boutique')).toBeNull();
  });

  it('apparaît (une fois, dans la section Outils) avec la permission', () => {
    render(
      <AllPagesOverlay
        role="owner" hiddenPaths={[]} permissions={perms('pos.roaming_device')}
        onClose={vi.fn()} onLogout={vi.fn()}
      />,
    );
    expect(screen.getAllByText('Changer de boutique').length).toBeGreaterThan(0);
  });

  it('au clic : ferme le menu, efface le choix itinérant local et navigue vers /caisse', () => {
    writeRoamingChoice('store-1', 'reg-1');
    const onClose = vi.fn();
    const assignSpy = vi.fn();
    const originalLocation = window.location;
    // @ts-expect-error -- remplacement volontaire pour intercepter la navigation
    delete window.location;
    window.location = { ...originalLocation, assign: assignSpy } as Location;

    render(
      <AllPagesOverlay
        role="owner" hiddenPaths={[]} permissions={perms('pos.roaming_device')}
        onClose={onClose} onLogout={vi.fn()}
      />,
    );
    fireEvent.click(screen.getAllByText('Changer de boutique')[0]!);

    expect(onClose).toHaveBeenCalled();
    expect(localStorage.getItem('webpos_roaming_register')).toBeNull();
    expect(assignSpy).toHaveBeenCalledWith('/caisse');

    window.location = originalLocation;
  });
});
