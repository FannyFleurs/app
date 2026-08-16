'use client';

import { useEffect, useRef, useState } from 'react';
import Screen from './Screen';
import { STORY_STEPS } from '@/lib/site/content/home';

/**
 * « HelloPos en action » — cinq étapes, cinq écrans réels.
 *
 * Grand écran : la colonne de gauche défile, la capture reste en place et
 * change à mesure que l'étape lue avance. Le défilement n'est jamais
 * détourné — c'est l'utilisateur qui mène, on ne fait qu'observer.
 *
 * Mobile : narration verticale classique, chaque étape suivie de sa capture.
 * Les deux versions sont dans le DOM mais mutuellement masquées ; les images
 * masquées sont en `loading="lazy"` et ne sont donc pas téléchargées.
 */
export default function ProductStory() {
  const [active, setActive] = useState(0);
  const stepsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const nodes = stepsRef.current.filter(Boolean) as HTMLDivElement[];
    if (!nodes.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        // L'étape « lue » est la plus proche du tiers haut du viewport.
        let best: { index: number; ratio: number } | null = null;
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.index ?? 0);
          if (entry.isIntersecting && (!best || entry.intersectionRatio > best.ratio)) {
            best = { index, ratio: entry.intersectionRatio };
          }
        }
        if (best) setActive(best.index);
      },
      { rootMargin: '-25% 0px -45% 0px', threshold: [0.15, 0.4, 0.75] },
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  return (
    <div className="hp-story">
      <div>
        {STORY_STEPS.map((step, i) => (
          <div
            key={step.index}
            ref={(el) => {
              stepsRef.current[i] = el;
            }}
            data-index={i}
            data-active={active === i}
            className="hp-story-step"
          >
            <p className="hp-story-index">{step.index}</p>
            <h3 className="hp-h3" style={{ marginTop: '0.5rem' }}>
              {step.title}
            </h3>
            <p className="hp-lede" style={{ marginTop: '0.75rem', maxWidth: '44ch' }}>
              {step.text}
            </p>
            {/* Version mobile : la capture suit son étape. */}
            <div className="hp-story-inline" style={{ marginTop: '1.5rem' }}>
              <Screen
                src={step.screen.src}
                alt={step.screen.alt}
                crop={step.screen.crop}
                caption={step.screen.caption}
                sizes="100vw"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Version grand écran : une seule capture, qui change. */}
      <div className="hp-story-media">
        <div className="hp-story-frame">
          {STORY_STEPS.map((step, i) => (
            <div
              key={step.index}
              className={`hp-story-shot${i === 0 ? ' hp-story-shot--first' : ''}`}
              data-active={active === i}
            >
              <Screen
                src={step.screen.src}
                alt=""
                crop={step.screen.crop}
                caption={step.screen.caption}
                sizes="(max-width: 1240px) 60vw, 700px"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
