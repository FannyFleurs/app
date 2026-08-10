'use client';

import { useEffect } from 'react';

/**
 * Verrouille le zoom sur l'écran de caisse.
 *
 * Une caisse est un poste fixe : l'écran doit rester tel qu'il a été réglé.
 * Un pincement involontaire — deux doigts posés en même temps pendant qu'on
 * encaisse — décale toute l'interface, et l'on découvre le problème au pire
 * moment, client devant soi, sans savoir comment revenir en arrière.
 *
 * `user-scalable=no` dans la balise viewport ne suffit pas : Safari iOS
 * l'ignore depuis iOS 10. Le pincement se bloque par les événements `gesture*`
 * (propres à WebKit), le zoom clavier et molette par leurs raccourcis.
 *
 * Le double-tap, lui, n'est PAS intercepté ici : `touch-action: manipulation`
 * (posé sur le body) le neutralise déjà côté navigateur. L'intercepter en JS
 * annulerait aussi le second clic — et donc l'ajout d'un deuxième article en
 * tapant deux fois sur une tuile.
 */
export default function NoZoom() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();

    // Pincement (WebKit / Safari iOS).
    document.addEventListener('gesturestart', stop, { passive: false });
    document.addEventListener('gesturechange', stop, { passive: false });
    document.addEventListener('gestureend', stop, { passive: false });

    // Ctrl + molette : zoom du navigateur sur un poste à souris — fréquent
    // quand on fait défiler la grille produits d'une main distraite.
    const onWheel = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault(); };
    window.addEventListener('wheel', onWheel, { passive: false });

    // Ctrl/⌘ + « + », « - », « 0 ».
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '_', '0'].includes(e.key)) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('gesturestart', stop);
      document.removeEventListener('gesturechange', stop);
      document.removeEventListener('gestureend', stop);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return null;
}
