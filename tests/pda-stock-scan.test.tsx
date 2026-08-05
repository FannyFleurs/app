// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import PdaStock from '@/app/pda/PdaStock';
import { QUIET_MS } from '@/app/pda/scan';

/**
 * Scan du PDA, rejoué sur le composant réel.
 *
 * Le comportement du lecteur intégré a été relevé sur le terminal via l'écran
 * « Diagnostic du scan » :
 *
 *   Frappes clavier : 31 pour 9 scans   → les chiffres n'arrivent PAS en frappes
 *   Événements « input » : 9            → un par scan, code complet d'un bloc
 *   Changements de valeur : 0           → tout est fini avant le tick suivant
 *   Dernière touche : Enter             → seul le terminateur est une frappe
 *
 * Le premier scénario ci-dessous reproduit exactement cette séquence. Les
 * suivants couvrent les autres modes de douchette, pour qu'un changement de
 * réglage du terminal ne casse pas le comptage.
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

const field = () => document.querySelector('input') as HTMLInputElement;

/** Mode observé : le code est inséré d'un bloc, puis la touche Entrée arrive. */
function scanBlockThenEnter(code: string) {
  act(() => {
    const el = field();
    el.value = code;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
}

/** Mode douchette USB : chaque caractère est une frappe, puis Entrée. */
function scanKeystrokes(code: string) {
  act(() => {
    for (const ch of code) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
}

/** Mode muet : la valeur apparaît, sans aucun événement ni terminateur. */
function scanSilent(code: string) {
  act(() => { field().value = code; });
  act(() => { vi.advanceTimersByTime(QUIET_MS + 120); });
}

/** Lignes du panier de l'onglet « Série ». */
function cart(): string[] {
  return Array.from(document.querySelectorAll('li'))
    .map((li) => (li.textContent ?? '').replace(/\s+/g, ' '))
    .filter((t) => t.includes('Qté'));
}

function mount() {
  return render(
    <PdaStock
      station={STATION}
      products={[A, B]}
      onUnknownCode={() => {}}
      onHome={() => {}}
      notify={() => {}}
    />,
  );
}

function goToSeries() {
  act(() => { (screen.getByText('Série (plusieurs)') as HTMLButtonElement).click(); });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, json: async () => ({ levels: [] }),
  })) as unknown as typeof fetch);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('entrée de marchandise — mode observé sur le terminal', () => {
  it('affiche l\'article scanné, puis le SUIVANT (onglet Unitaire)', () => {
    mount();
    scanBlockThenEnter(A.barcode);
    expect(screen.getByText('Rose Avalanche')).toBeTruthy();

    scanBlockThenEnter(B.barcode);
    expect(screen.getByText('Eucalyptus Cinerea')).toBeTruthy();
    expect(screen.queryByText('Rose Avalanche')).toBeNull();
  });

  it('compte deux fois le MÊME article scanné deux fois', () => {
    mount();
    goToSeries();
    scanBlockThenEnter(A.barcode);
    scanBlockThenEnter(A.barcode);
    expect(cart().some((t) => t.includes('Rose Avalanche') && t.includes('Qté : 2'))).toBe(true);
  });

  it('crée une ligne DISTINCTE pour un second article', () => {
    mount();
    goToSeries();
    scanBlockThenEnter(A.barcode);
    scanBlockThenEnter(A.barcode);
    scanBlockThenEnter(B.barcode);

    const lines = cart();
    expect(lines.length).toBe(2);
    expect(lines.some((t) => t.includes('Rose Avalanche') && t.includes('Qté : 2'))).toBe(true);
    expect(lines.some((t) => t.includes('Eucalyptus Cinerea') && t.includes('Qté : 1'))).toBe(true);
  });

  it('vide le champ après chaque scan', () => {
    mount();
    scanBlockThenEnter(A.barcode);
    expect(field().value).toBe('');
  });
});

describe('entrée de marchandise — douchette en frappes clavier', () => {
  it('enchaîne deux articles différents', () => {
    mount();
    goToSeries();
    scanKeystrokes(A.barcode);
    scanKeystrokes(B.barcode);

    const lines = cart();
    expect(lines.length).toBe(2);
    expect(lines.some((t) => t.includes('Rose Avalanche') && t.includes('Qté : 1'))).toBe(true);
    expect(lines.some((t) => t.includes('Eucalyptus Cinerea') && t.includes('Qté : 1'))).toBe(true);
  });
});

describe('entrée de marchandise — lecteur muet (aucun événement)', () => {
  it('valide le code sur la seule observation du champ', () => {
    mount();
    goToSeries();
    scanSilent(A.barcode);
    scanSilent(B.barcode);

    const lines = cart();
    expect(lines.length).toBe(2);
    expect(lines.some((t) => t.includes('Rose Avalanche'))).toBe(true);
    expect(lines.some((t) => t.includes('Eucalyptus Cinerea'))).toBe(true);
  });
});

/**
 * Piège Android : vider le champ pendant l'événement clavier est annulé par le
 * clavier système, qui réinjecte son tampon de composition. La touche Entrée
 * suivante relit alors l'ANCIEN code — l'article scanné n'apparaît jamais et
 * c'est le précédent qui est recompté. C'est le symptôme signalé en boutique.
 */
describe('entrée de marchandise — réinjection du champ par le clavier système', () => {
  it('ne recompte pas un code réinjecté sans nouveau scan', () => {
    mount();
    goToSeries();
    scanBlockThenEnter(A.barcode);

    // Le clavier système remet le code dans le champ, sans aucun événement.
    act(() => { field().value = A.barcode; });
    act(() => { vi.advanceTimersByTime(QUIET_MS + 200); });

    expect(cart().some((t) => t.includes('Rose Avalanche') && t.includes('Qté : 1'))).toBe(true);
    expect(field().value).toBe('');
  });

  it('affiche bien le SECOND article même après une réinjection', () => {
    mount();
    goToSeries();
    scanBlockThenEnter(A.barcode);
    act(() => { field().value = A.barcode; });          // réinjection
    act(() => { vi.advanceTimersByTime(QUIET_MS + 200); });

    scanBlockThenEnter(B.barcode);                       // vrai second scan

    const lines = cart();
    expect(lines.some((t) => t.includes('Eucalyptus Cinerea') && t.includes('Qté : 1'))).toBe(true);
    expect(lines.some((t) => t.includes('Rose Avalanche') && t.includes('Qté : 1'))).toBe(true);
  });
});

/**
 * Garantie de dernier recours : après chaque scan, l'élément de saisie est
 * DÉTRUIT puis recréé. Un élément neuf n'a ni valeur, ni tampon de composition
 * du clavier système — aucun code précédent ne peut donc être relu, quel que
 * soit le comportement du terminal.
 */
describe('entrée de marchandise — champ recréé à chaque scan', () => {
  it('remplace l\'élément de saisie après un scan', () => {
    mount();
    const before = field();
    scanBlockThenEnter(A.barcode);
    const after = field();
    expect(after).not.toBe(before);
    expect(after.value).toBe('');
  });

  it('reste opérationnel après plusieurs remplacements', () => {
    mount();
    goToSeries();
    scanBlockThenEnter(A.barcode);
    scanBlockThenEnter(B.barcode);
    scanBlockThenEnter(A.barcode);

    const lines = cart();
    expect(lines.length).toBe(2);
    expect(lines.some((t) => t.includes('Rose Avalanche') && t.includes('Qté : 2'))).toBe(true);
    expect(lines.some((t) => t.includes('Eucalyptus Cinerea') && t.includes('Qté : 1'))).toBe(true);
  });
});
