// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import OnlineGiftCardsSettingsForm from '@/app/(app)/settings/online-gift-cards/OnlineGiftCardsSettingsForm';

/**
 * Section « Code à intégrer sur votre site » de /settings/online-gift-cards —
 * le widget embed doit refléter la clé publique RÉELLE de la boutique
 * sélectionnée (jamais une clé codée en dur, jamais celle d'une autre
 * boutique après changement de sélection).
 */

const STORES = [
  { id: 'store-ff', name: 'Fanny Fleurs' },
  { id: 'store-pv', name: 'Plante Verte' },
];

interface FakeSettings {
  enabled: boolean; public_key: string; allowed_origins: string[];
  preset_amounts: number[]; allow_custom_amount: boolean; min_amount: number; max_amount: number;
}

let settingsByStore: Record<string, FakeSettings>;

function resetFakeApi() {
  settingsByStore = {
    'store-ff': {
      enabled: true, public_key: 'hp_gc_fannyfleurskey000000001', allowed_origins: [],
      preset_amounts: [25, 50], allow_custom_amount: true, min_amount: 10, max_amount: 500,
    },
    'store-pv': {
      enabled: true, public_key: 'hp_gc_planteverte0000000000002', allowed_origins: [],
      preset_amounts: [25, 50], allow_custom_amount: true, min_amount: 10, max_amount: 500,
    },
  };
}

let clipboardWritten: string[] = [];

beforeEach(() => {
  resetFakeApi();
  clipboardWritten = [];
  Object.assign(navigator, {
    clipboard: { writeText: async (text: string) => { clipboardWritten.push(text); } },
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith('/api/settings/online-gift-cards')) {
      const u = new URL(url, 'https://x.test');
      const storeId = u.searchParams.get('store_id') ?? '';
      return { ok: true, json: async () => ({ settings: settingsByStore[storeId] }) } as unknown as Response;
    }
    throw new Error(`Requête non simulée : ${url}`);
  }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function renderForm() {
  render(<OnlineGiftCardsSettingsForm canEdit stores={STORES} />);
  await waitFor(() => screen.getByText('Code à intégrer sur votre site'));
}

function storeSelect(): HTMLSelectElement {
  return screen.getByText('Boutique').parentElement!.querySelector('select')!;
}

describe('Code à intégrer — /settings/online-gift-cards', () => {
  it('affiche le snippet avec la clé publique de la boutique sélectionnée par défaut', async () => {
    const { container } = render(<OnlineGiftCardsSettingsForm canEdit stores={STORES} />);
    await waitFor(() => screen.getByText('Code à intégrer sur votre site'));
    const pre = container.querySelector('pre')!;
    expect(pre.textContent).toContain('hp_gc_fannyfleurskey000000001');
    expect(pre.textContent).toContain('embed.js');
  });

  it('change de boutique => le snippet reflète la clé de CETTE boutique, jamais l\'ancienne', async () => {
    const { container } = render(<OnlineGiftCardsSettingsForm canEdit stores={STORES} />);
    await waitFor(() => screen.getByText('Code à intégrer sur votre site'));
    fireEvent.change(storeSelect(), { target: { value: 'store-pv' } });
    await waitFor(() => expect(container.querySelector('pre')!.textContent).toContain('hp_gc_planteverte0000000000002'));
    expect(container.querySelector('pre')!.textContent).not.toContain('hp_gc_fannyfleurskey000000001');
  });

  it('le bouton "Copier le code" copie le snippet EXACT affiché (clé de la bonne boutique)', async () => {
    await renderForm();
    fireEvent.click(screen.getByText('Copier le code'));
    await waitFor(() => expect(clipboardWritten).toHaveLength(1));
    expect(clipboardWritten[0]).toContain('hp_gc_fannyfleurskey000000001');
    expect(clipboardWritten[0]).toContain('<hellopos-gift-card');
    expect(clipboardWritten[0]).toContain('embed.js');
    expect(clipboardWritten[0]).not.toContain('hp_gc_planteverte0000000000002');
  });
});
