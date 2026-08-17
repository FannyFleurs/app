'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';

/**
 * Bouton « Connexion » et le choix qu'il ouvre : la caisse ou le back-office.
 *
 * Les deux espaces ne se connectent pas de la même manière — code vendeur
 * d'un côté, email et mot de passe de l'autre. Envoyer tout le monde sur la
 * caisse par défaut faisait fausse route pour qui vient piloter sa boutique ;
 * le bouton pose donc la question au lieu d'y répondre à la place du visiteur.
 *
 * Accessibilité : simple révélation (`aria-expanded`), les deux liens entrent
 * dans l'ordre de tabulation à l'ouverture. Fermeture par Échap et par un clic
 * en dehors, focus rendu au bouton.
 */
export default function LoginMenu({ caisse, bo }: { caisse: string; bo: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <div className="hp-login" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className="hp-btn hp-btn--ghost hp-btn--sm"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Connexion
        <svg
          className={`hp-login-caret${open ? ' is-open' : ''}`}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m2.5 4.5 3.5 3.5 3.5-3.5" />
        </svg>
      </button>

      {open ? (
        <div className="hp-login-panel">
          <a href={caisse} className="hp-login-choice">
            <span className="hp-login-icon" aria-hidden="true"><Icon name="cart" size={18} /></span>
            <span>
              <span className="hp-login-label">La caisse</span>
              <span className="hp-login-hint">Écran de vente</span>
            </span>
          </a>
          <a href={bo} className="hp-login-choice">
            <span className="hp-login-icon" aria-hidden="true"><Icon name="chart" size={18} /></span>
            <span>
              <span className="hp-login-label">Le back-office</span>
              <span className="hp-login-hint">Catalogue, stocks, rapports</span>
            </span>
          </a>
        </div>
      ) : null}
    </div>
  );
}
