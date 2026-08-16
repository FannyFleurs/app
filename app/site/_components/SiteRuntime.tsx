'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { track } from '@/lib/site/analytics';

/**
 * Comportements transverses du site, en un seul composant client :
 *
 *  1. marque la racine `.hp` avec `hp-js` — sans JavaScript, aucune animation
 *     d'apparition n'est appliquée et tout le contenu reste visible ;
 *  2. révèle les blocs `[data-reveal]` à l'entrée dans le viewport ;
 *  3. signale l'état « défilé » à l'en-tête collant ;
 *  4. relaie les événements analytics des éléments `[data-track]` par
 *     délégation : un seul écouteur pour tout le site.
 *
 * `prefers-reduced-motion` est respecté : dans ce cas, aucune observation
 * d'apparition n'est mise en place, les blocs sont visibles d'emblée.
 */
export default function SiteRuntime() {
  const pathname = usePathname();

  /* --- 1. Apparitions ----------------------------------------------- */
  /* Réinstallé à chaque page : la navigation client remplace le contenu. */
  useEffect(() => {
    const root = document.querySelector('.hp');
    root?.classList.add('hp-js');
    const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (!targets.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      targets.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pathname]);

  useEffect(() => {
    /* --- 2. En-tête collant ----------------------------------------- */
    const header = document.querySelector<HTMLElement>('.hp-header');
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        header?.setAttribute('data-scrolled', window.scrollY > 8 ? 'true' : 'false');
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    /* --- 3. Mesure des conversions ---------------------------------- */
    const onClick = (e: Event) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-track]');
      if (!el) return;
      const name = el.getAttribute('data-track');
      if (!name) return;
      let props: Record<string, string | number | boolean> = {};
      const raw = el.getAttribute('data-track-props');
      if (raw) {
        try {
          props = JSON.parse(raw) as Record<string, string | number | boolean>;
        } catch {
          /* attribut mal formé : on envoie l'événement sans propriétés */
        }
      }
      track(name, props);
    };
    document.addEventListener('click', onClick);

    /* Première saisie dans un formulaire : un événement par formulaire. */
    const started = new WeakSet<HTMLFormElement>();
    const onInput = (e: Event) => {
      const form = (e.target as HTMLElement | null)?.closest('form');
      if (!form || started.has(form)) return;
      started.add(form);
      track('formulaire_commence', { formulaire: form.getAttribute('name') ?? 'contact' });
    };
    document.addEventListener('input', onInput, true);

    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('click', onClick);
      document.removeEventListener('input', onInput, true);
    };
  }, []);

  return null;
}
