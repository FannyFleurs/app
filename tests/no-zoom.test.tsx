// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import NoZoom from '@/components/NoZoom';

/**
 * Verrou de zoom de la caisse.
 *
 * Un poste de caisse doit rester tel qu'il a été réglé : un pincement
 * involontaire décale toute l'interface en plein encaissement. Mais le verrou
 * ne doit rien casser d'autre — la molette fait toujours défiler la grille, et
 * le double-tap reste un double clic (deux articles ajoutés), pas un zoom
 * intercepté.
 */

afterEach(cleanup);

/** Envoie un événement et dit s'il a été neutralisé. */
function envoie(cible: EventTarget, e: Event): boolean {
  cible.dispatchEvent(e);
  return e.defaultPrevented;
}

describe('Caisse — zoom verrouillé', () => {
  it('bloque le pincement', () => {
    render(<NoZoom />);
    // `gesturestart` est l'événement de pincement de WebKit : c'est le seul
    // levier sur Safari iOS, qui ignore `user-scalable=no`.
    expect(envoie(document, new Event('gesturestart', { cancelable: true }))).toBe(true);
    expect(envoie(document, new Event('gesturechange', { cancelable: true }))).toBe(true);
  });

  it('bloque le zoom molette et clavier', () => {
    render(<NoZoom />);
    const molette = new Event('wheel', { cancelable: true }) as WheelEvent;
    Object.defineProperty(molette, 'ctrlKey', { value: true });
    expect(envoie(window, molette)).toBe(true);

    for (const key of ['+', '-', '0']) {
      const clavier = new KeyboardEvent('keydown', { cancelable: true, ctrlKey: true, key });
      expect(envoie(window, clavier)).toBe(true);
    }
  });

  it('laisse défiler à la molette', () => {
    // Sans quoi la grille produits deviendrait inutilisable à la souris.
    render(<NoZoom />);
    const molette = new Event('wheel', { cancelable: true }) as WheelEvent;
    Object.defineProperty(molette, 'ctrlKey', { value: false });
    expect(envoie(window, molette)).toBe(false);
  });

  it('laisse passer une frappe ordinaire', () => {
    render(<NoZoom />);
    expect(envoie(window, new KeyboardEvent('keydown', { cancelable: true, key: '0' }))).toBe(false);
  });

  it('n\'intercepte pas le double-tap', () => {
    // `touch-action: manipulation` neutralise déjà le zoom par double-tap côté
    // navigateur. L'intercepter ici annulerait le second clic — donc l'ajout
    // d'un deuxième article en tapant deux fois sur une tuile.
    render(<NoZoom />);
    const t1 = new Event('touchend', { cancelable: true });
    const t2 = new Event('touchend', { cancelable: true });
    expect(envoie(document, t1)).toBe(false);
    expect(envoie(document, t2)).toBe(false);
  });

  it('retire ses écouteurs en partant', () => {
    // Le verrou ne vaut que pour la caisse : laissé en place, il empêcherait
    // de zoomer sur un tableau dense du back-office.
    const vue = render(<NoZoom />);
    vue.unmount();
    expect(envoie(document, new Event('gesturestart', { cancelable: true }))).toBe(false);
  });
});
