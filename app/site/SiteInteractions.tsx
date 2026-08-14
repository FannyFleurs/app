'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Micro-interactions du site vitrine, pilotées côté client sans toucher au
 * balisage des pages :
 *  - en-tête fixe qui se réduit au défilement (attribut data-scrolled) ;
 *  - apparition en fondu + glissement des sections à leur entrée à l'écran.
 *
 * Rejoué à chaque navigation (dépendance pathname) pour couvrir les pages
 * chargées côté client. Entièrement neutralisé si l'utilisateur a demandé la
 * réduction des animations.
 */
export default function SiteInteractions() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.querySelector('.site-root');
    if (!root) return;
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const header = root.querySelector('header');

    // Sections à révéler. On les masque tout de suite (JS actif), sauf sous
    // réduction d'animations où l'on ne touche à rien.
    const pending = new Set<HTMLElement>();
    if (!reduce) {
      root.querySelectorAll<HTMLElement>('main > section').forEach((s) => {
        s.classList.add('reveal');
        pending.add(s);
      });
    }

    // Révèle toute section entrée dans la zone visible OU déjà dépassée (pour
    // qu'un saut de défilement — ancre, touche Fin — ne laisse rien de caché).
    const revealVisible = () => {
      if (pending.size === 0) return;
      const trigger = window.innerHeight * 0.88;
      for (const s of Array.from(pending)) {
        if (s.getBoundingClientRect().top < trigger) {
          s.classList.add('reveal-in');
          pending.delete(s);
        }
      }
    };

    let ticking = false;
    const frame = () => {
      if (header) header.setAttribute('data-scrolled', window.scrollY > 8 ? 'true' : 'false');
      revealVisible();
      ticking = false;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(frame);
    };

    // Passe initiale synchrone : l'en-tête prend son état, et les sections
    // déjà visibles s'affichent sans animation (aucun flash).
    frame();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [pathname]);

  return null;
}
