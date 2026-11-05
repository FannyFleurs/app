// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import PdaDestockage from '@/app/pda/PdaDestockage';

/**
 * Déstockage PDA : scan à la chaîne (chaque scan = −1), motif obligatoire
 * avant de valider, code de série affiché après validation. Même moteur de
 * scan que l'Entrée de marchandise (voir pda-stock-scan.test.tsx) — on ne
 * revalide pas le moteur ici, seulement le comportement propre à cet écran.
 */

const STATION = { id: 's1', store_id: 'store-1', store_name: 'Boutique', name: 'PDA' };

const A = {
  id: 'a', name: 'Rose Avalanche', sku: 'REF-A', barcode: '4002477692890',
  extra_barcodes: [], sale_price_ttc: 2, discount_type: null, discount_value: null,
  category_name: null,
};
const B = {
  id: 'b', name: 'Eucalyptus Cinerea', sku: 'REF-B', barcode: '3401579811002',
  extra_barcodes: [], sale_price_ttc: 3, discount_type: null, discount_value: null,
  category_name: null,
};

const field = () => document.querySelector('input[placeholder="Scanner ou rechercher…"]') as HTMLInputElement;

function settle(ms = 400) {
  act(() => { vi.advanceTimersByTime(ms); });
}

function scanBlockThenEnter(code: string) {
  act(() => {
    const el = field();
    el.value = code;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  settle();
}

function cart(): string[] {
  return Array.from(document.querySelectorAll('li'))
    .map((li) => (li.textContent ?? '').replace(/\s+/g, ' '));
}

function mount() {
  return render(
    <PdaDestockage
      station={STATION}
      products={[A, B]}
      onUnknownCode={() => {}}
      onHome={() => {}}
      notify={() => {}}
    />,
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes('/api/settings/stock-movement-reasons')) {
      return { ok: true, json: async () => ({ settings: { reasons: [{ label: 'Casse', justification_required: false }] } }) };
    }
    if (String(url).includes('/api/stock/destockage')) {
      return { ok: true, json: async () => ({ id: 'batch-1', reference: 'D-2026-000001', item_count: 1, total_quantity: 2 }) };
    }
    return { ok: false, json: async () => ({}) };
  }) as unknown as ReturnType<typeof vi.fn>;
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Déstockage — scan à la chaîne', () => {
  it('compte deux fois le MÊME article scanné deux fois', () => {
    mount();
    scanBlockThenEnter(A.barcode);
    scanBlockThenEnter(A.barcode);
    expect(cart().some((t) => t.includes('Rose Avalanche') && t.includes('Qté à sortir : 2'))).toBe(true);
  });

  it('crée une ligne distincte pour un second article', () => {
    mount();
    scanBlockThenEnter(A.barcode);
    scanBlockThenEnter(B.barcode);
    expect(cart().length).toBe(2);
  });
});

describe('Déstockage — motif obligatoire avant validation', () => {
  it('le bouton Valider reste désactivé sans motif choisi', () => {
    mount();
    scanBlockThenEnter(A.barcode);
    const btn = screen.getByText('Valider le déstockage') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('choisir un motif préconfiguré (sans justification requise) active la validation', async () => {
    mount();
    scanBlockThenEnter(A.barcode);
    act(() => { (screen.getByText('À choisir') as HTMLElement).closest('button')!.click(); });
    await act(async () => { await Promise.resolve(); });
    act(() => { (screen.getByText('Casse') as HTMLButtonElement).click(); });
    act(() => { (screen.getByText('Valider le motif') as HTMLButtonElement).click(); });
    const btn = screen.getByText('Valider le déstockage') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});

describe('Déstockage — validation et code de série', () => {
  it('affiche le code de série renvoyé par le serveur et vide le panier', async () => {
    mount();
    scanBlockThenEnter(A.barcode);
    act(() => { (screen.getByText('À choisir') as HTMLElement).closest('button')!.click(); });
    await act(async () => { await Promise.resolve(); });
    act(() => { (screen.getByText('Casse') as HTMLButtonElement).click(); });
    act(() => { (screen.getByText('Valider le motif') as HTMLButtonElement).click(); });

    await act(async () => {
      (screen.getByText('Valider le déstockage') as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('D-2026-000001')).toBeTruthy();
    expect(cart().length).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith('/api/stock/destockage', expect.objectContaining({ method: 'POST' }));
  });
});
