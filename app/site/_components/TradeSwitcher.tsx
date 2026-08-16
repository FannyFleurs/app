'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { TRADES } from '@/lib/site/content/trades';
import { track } from '@/lib/site/analytics';
import { Icon } from './icons';
import Visual from './Visual';

/**
 * « Un même outil. Des commerces différents. »
 *
 * Sélecteur de métier au motif ARIA « tabs » : navigation aux flèches,
 * Origine/Fin, et un seul panneau visible. Le contenu, la photographie et
 * les fonctions mises en avant changent avec le métier.
 */
export default function TradeSwitcher() {
  const [current, setCurrent] = useState(0);
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  function select(index: number) {
    const next = (index + TRADES.length) % TRADES.length;
    setCurrent(next);
    tabsRef.current[next]?.focus();
    const trade = TRADES[next];
    if (trade) track('page_metier', { metier: trade.slug, source: 'accueil' });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === 'ArrowRight') { e.preventDefault(); select(index + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); select(index - 1); }
    else if (e.key === 'Home') { e.preventDefault(); select(0); }
    else if (e.key === 'End') { e.preventDefault(); select(TRADES.length - 1); }
  }

  return (
    <div>
      <div className="hp-tabs" role="tablist" aria-label="Choisir un métier">
        {TRADES.map((t, i) => (
          <button
            key={t.slug}
            ref={(el) => {
              tabsRef.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.slug}`}
            aria-selected={current === i}
            aria-controls={`panel-${t.slug}`}
            tabIndex={current === i ? 0 : -1}
            className="hp-tab"
            onClick={() => setCurrent(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* Hors de la liste d'onglets : un lien n'a rien à faire dans un
          `role="tablist"`, qui n'accepte que des onglets. */}
      <p style={{ marginTop: '0.75rem' }}>
        <Link href="/solutions" className="hp-link" style={{ fontSize: 'var(--fs-xs)' }}>
          Un autre commerce ? Voir toutes les solutions
          <span className="hp-arrow" aria-hidden="true"> →</span>
        </Link>
      </p>

      {TRADES.map((t, i) => (
        <div
          key={t.slug}
          role="tabpanel"
          id={`panel-${t.slug}`}
          aria-labelledby={`tab-${t.slug}`}
          className="hp-tabpanel"
          hidden={current !== i}
          tabIndex={0}
        >
          <div className="hp-cols hp-cols--sidebar" style={{ marginTop: 'clamp(2rem, 4vw, 3.5rem)' }}>
            <div>
              <h3 className="hp-h2">{t.claim}</h3>
              <p className="hp-lede" style={{ marginTop: '1rem' }}>{t.lede}</p>
              <ul
                style={{
                  listStyle: 'none',
                  margin: '1.75rem 0 0',
                  padding: 0,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                {t.chips.map((c) => (
                  <li key={c} className="hp-chip">
                    <Icon name="check" size={14} />
                    {c}
                  </li>
                ))}
              </ul>
              <p style={{ marginTop: '2rem' }}>
                <Link
                  href={`/solutions/${t.slug}`}
                  className="hp-link"
                  data-track="page_metier"
                  data-track-props={JSON.stringify({ metier: t.slug, source: 'accueil-cta' })}
                >
                  Découvrir HelloPos pour les {t.label.toLowerCase()}
                  <span className="hp-arrow" aria-hidden="true"> →</span>
                </Link>
              </p>
            </div>

            <div>
              <Visual slot={t.photoSlot} screen={t.screen} sizes="(max-width: 900px) 100vw, 55vw" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
