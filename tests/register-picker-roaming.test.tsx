// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import RegisterPicker from '@/app/(app)/caisse/RegisterPicker';

/**
 * Poste itinérant (`pos.roaming_device`) : un compte autorisé peut utiliser
 * une caisse LIBRE sans lier son appareil en permanence (aucun appel réseau,
 * juste un choix remonté au parent via `onRoam`) — en plus, jamais à la
 * place, de la liaison permanente existante. Une caisse déjà prise par un
 * autre poste reste indisponible dans les deux cas : l'itinérance choisit
 * toujours une caisse dédiée et libre.
 */

const STORES = [{ id: 'store-1', code: 'FF', name: 'Fanny Fleurs' }];
const REGISTERS_FREE = [
  { id: 'reg-1', store_id: 'store-1', code: 'R1', name: 'Caisse 1', device_id: null, device_name: null },
];
const REGISTERS_TAKEN = [
  { id: 'reg-2', store_id: 'store-1', code: 'R2', name: 'Caisse 2', device_id: 'other-device', device_name: 'iPad Boutique' },
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('RegisterPicker — compte standard (sans pos.roaming_device)', () => {
  it("une caisse libre se lie en un clic, comme avant — aucune option itinérante visible", () => {
    const onBound = vi.fn();
    render(
      <RegisterPicker stores={STORES} registers={REGISTERS_FREE} deviceId="my-device" onBound={onBound} />,
    );
    expect(screen.queryByText(/sans lier/i)).toBeNull();
    expect(screen.getByText('Caisse 1')).toBeTruthy();
  });
});

describe('RegisterPicker — compte itinérant (pos.roaming_device)', () => {
  it("une caisse LIBRE propose les deux actions : lier en permanence, ou l'utiliser sans lier", () => {
    render(
      <RegisterPicker
        stores={STORES} registers={REGISTERS_FREE} deviceId="my-device"
        onBound={vi.fn()} canRoam onRoam={vi.fn()}
      />,
    );
    expect(screen.getByText('Lier cet appareil en permanence')).toBeTruthy();
    expect(screen.getByText('Utiliser sans lier (itinérant)')).toBeTruthy();
  });

  it("\"Utiliser sans lier\" appelle onRoam avec (storeId, registerId) et ne fait AUCUN appel réseau", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    const onRoam = vi.fn();
    render(
      <RegisterPicker
        stores={STORES} registers={REGISTERS_FREE} deviceId="my-device"
        onBound={vi.fn()} canRoam onRoam={onRoam}
      />,
    );
    fireEvent.click(screen.getByText('Utiliser sans lier (itinérant)'));
    expect(onRoam).toHaveBeenCalledWith('store-1', 'reg-1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("une caisse déjà prise par un AUTRE poste reste indisponible, aucune option itinérante dessus", () => {
    render(
      <RegisterPicker
        stores={STORES} registers={REGISTERS_TAKEN} deviceId="my-device"
        onBound={vi.fn()} canRoam onRoam={vi.fn()}
      />,
    );
    expect(screen.getByText(/Utilisee par iPad Boutique/)).toBeTruthy();
    expect(screen.queryByText('Utiliser sans lier (itinérant)')).toBeNull();
    expect((screen.getByText('Caisse 2').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it("\"Lier cet appareil en permanence\" garde le comportement existant (appel réseau de liaison)", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    const onBound = vi.fn();
    render(
      <RegisterPicker
        stores={STORES} registers={REGISTERS_FREE} deviceId="my-device"
        onBound={onBound} canRoam onRoam={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Lier cet appareil en permanence'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/registers/reg-1/bind',
      expect.objectContaining({ method: 'POST' }),
    ));
    await waitFor(() => expect(onBound).toHaveBeenCalledWith('store-1', 'reg-1'));
  });
});
