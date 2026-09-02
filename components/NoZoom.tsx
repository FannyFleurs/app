'use client';

import { useEffect } from 'react';

/**
 * Bloque tout zoom dans l'app / la PWA. Le meta viewport (user-scalable=no) ne
 * suffit pas : iOS Safari l'ignore et laisse pincer / double-taper pour zoomer.
 * On neutralise donc :
 *  - le pincement (gesture* de Safari, et touchmove à ≥ 2 doigts) ;
 *  - le double-tap (touch-action: manipulation) ;
 *  - le zoom clavier/souris (Ctrl + molette).
 * Le défilement à un doigt reste intact. Monté uniquement dans l'app, pas sur
 * le site vitrine public (accessibilité).
 */
export default function NoZoom() {
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.touchAction;
    html.style.touchAction = 'manipulation';

    const preventGesture = (e: Event) => e.preventDefault();
    const onTouchMove = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    const onWheel = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault(); };

    document.addEventListener('gesturestart', preventGesture as EventListener);
    document.addEventListener('gesturechange', preventGesture as EventListener);
    document.addEventListener('gestureend', preventGesture as EventListener);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      html.style.touchAction = prev;
      document.removeEventListener('gesturestart', preventGesture as EventListener);
      document.removeEventListener('gesturechange', preventGesture as EventListener);
      document.removeEventListener('gestureend', preventGesture as EventListener);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('wheel', onWheel);
    };
  }, []);

  return null;
}
