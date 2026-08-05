// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import PdaStock from '@/app/pda/PdaStock';
import { QUIET_MS } from '@/app/pda/scan';
import { LABEL_DEFAULTS } from '@/lib/settings/label';

/**
 * Scan du PDA, rejoué sur le composant réel.
 *
 * Le moteur cible le mode Android « Input Box Mode » relevé sur le terminal :
 * le lecteur écrit l'EAN complet dans le champ, puis envoie Entrée. La VALEUR
 * DU CHAMP est la source de vérité ; le tampon de frappes n'est qu'un repli
 * pour les douchettes en émulation clavier.
 *
 * Deux détails du moteur conditionnent l'écriture de ces tests :
 *  - un même code revalidé sous 120 ms est considéré comme un double
 *    traitement du même événement et ignoré : on espace donc les scans ;
 *  - la lecture du champ est différée de quelques dizaines de millisecondes,
 *    le temps que le terminal ait fini d'écrire.
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

/**
 * Laisse le moteur terminer ses traitements différés entre deux gestes.
 * Généreux à dessein : après un code accepté, l'écran ré-arme le champ
 * jusqu'à 120 ms plus tard, et la lecture du champ est elle-même différée.
 */
function settle(ms = 400) {
  act(() => { vi.advanceTimersByTime(ms); });
}

/** Mode observé : le code est inséré d'un bloc, puis la touche Entrée arrive. */
function scanBlockThenEnter(code: string) {
  act(() => {
    const el = field();
    el.value = code;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  // Délai entre deux gâchettes : au-delà de la fenêtre anti-doublon.
  settle();
}

/** Mode douchette USB : chaque caractère est une frappe, puis Entrée. */
function scanKeystrokes(code: string) {
  act(() => {
    for (const ch of code) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  settle();
}

/** Mode muet : la valeur apparaît, sans aucun événement ni terminateur. */
function scanSilent(code: string) {
  act(() => { field().value = code; });
  // Le repli par sondage détecte le changement, puis la lecture différée valide.
  settle();
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
      settings={LABEL_DEFAULTS}
      cloudPrinter={null}
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
 * Un même code validé deux fois à quelques millisecondes d'intervalle vient
 * forcément du même geste, traité par deux canaux (valeur du champ puis
 * Entrée) : il ne doit être compté qu'une fois. Deux gâchettes réelles, elles,
 * sont toujours séparées de bien plus que cette fenêtre.
 */
describe('entrée de marchandise — double traitement d\'un même geste', () => {
  it('ne compte qu\'une fois un code validé deux fois dans le même instant', () => {
    mount();
    goToSeries();

    act(() => {
      const el = field();
      el.value = A.barcode;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      // Second canal, immédiatement après : même geste, pas un nouveau scan.
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    settle();

    expect(cart().some((t) => t.includes('Rose Avalanche') && t.includes('Qté : 1'))).toBe(true);
  });
});

/**
 * Le champ de saisie n'est JAMAIS détruit ni recréé : le moteur le garantit
 * (`generation` reste à 0). Le détruire faisait perdre le focus et coupait le
 * lecteur intégré, qui n'écrit que dans le champ actif.
 */
describe('entrée de marchandise — champ conservé entre les scans', () => {
  it('garde le même élément de saisie après un scan', () => {
    mount();
    const before = field();
    scanBlockThenEnter(A.barcode);
    expect(field()).toBe(before);
    expect(before.value).toBe('');
  });

  it('reste opérationnel sur une suite de scans', () => {
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

/**
 * Le code retenu est celui présent dans le CHAMP au moment de la validation :
 * le moteur ne reconstitue plus le texte à partir de `InputEvent.data`, source
 * de codes incomplets. Le champ est vidé après chaque validation, ce qui
 * empêche un ancien code d'être relu.
 */
describe('entrée de marchandise — la valeur du champ fait foi', () => {
  it('retient le contenu du champ, pas les frappes résiduelles', () => {
    mount();
    goToSeries();

    act(() => {
      // Frappes parasites d'un scan précédent, puis vraie écriture du lecteur.
      for (const ch of A.barcode) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
      }
      const el = field();
      el.value = B.barcode;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    settle();

    const lines = cart();
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('Eucalyptus Cinerea');
  });
});
