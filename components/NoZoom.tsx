'use client';

import { useEffect } from 'react';

/**
 * Bloque tout zoom dans l'app / la PWA. Le meta viewport (user-scalable=no) ne
 * suffit pas : iOS Safari l'ignore et laisse pincer / double-taper pour zoomer.
 * On neutralise donc :
 *  - le pincement (gesture* de Safari, et touchmove à ≥ 2 doigts) ;
 *  - le double-tap (touch-action: manipulation) ;
 *  - le zoom souris (Ctrl + molette) et clavier (Ctrl/Cmd + « + », « - », « 0 »).
 * Le défilement à un doigt (et à la molette sans Ctrl) reste intact. Monté
 * uniquement dans l'app, pas sur le site vitrine public (accessibilité).
 */
export default function NoZoom() {
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.touchAction;
    html.style.touchAction = 'manipulation';

    const preventGesture = (e: Event) => e.preventDefault();
    const onTouchMove = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    const onWheel = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault(); };
    // Zoom clavier : Ctrl/Cmd + « + » / « - » / « = » (le +, sans Maj) / « 0 »
    // (remise à 100 %). On ne touche à rien d'autre : une frappe ordinaire
    // passe (sinon la recherche produit et les champs seraient neutralisés).
    const onKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault();
    };

    document.addEventListener('gesturestart', preventGesture as EventListener);
    document.addEventListener('gesturechange', preventGesture as EventListener);
    document.addEventListener('gestureend', preventGesture as EventListener);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    // molette + clavier au niveau window : c'est là que le navigateur déclenche
    // le zoom de page, et là que ces événements remontent.
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeydown);

    return () => {
      html.style.touchAction = prev;
      document.removeEventListener('gesturestart', preventGesture as EventListener);
      document.removeEventListener('gesturechange', preventGesture as EventListener);
      document.removeEventListener('gestureend', preventGesture as EventListener);
      document.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeydown);
    };
  }, []);

  return null;
}
