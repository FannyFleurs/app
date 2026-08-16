'use client';

import { useEffect, useRef, useState } from 'react';
import ContactWizard from './ContactWizard';
import { Icon } from './icons';

/**
 * Bouton « Nous contacter » de la page d'attente, et la fenêtre qui s'ouvre
 * dessus.
 *
 * Le formulaire est celui du site : il poste sur /api/contact, qui fonctionne
 * que le site soit publié ou non. Aucune navigation, donc aucun risque
 * d'atterrir sur une page qui n'est pas servie.
 *
 * Accessibilité : `aria-modal`, fermeture par Échap et par le fond, focus
 * porté sur le premier champ à l'ouverture puis rendu au bouton à la
 * fermeture, défilement de la page bloqué pendant l'ouverture.
 */
export default function HoldingContact() {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    btnRef.current?.focus();
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="hp-btn hp-btn--gold hp-btn--lg"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Nous contacter
      </button>

      {open ? (
        <div className="hp-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div
            ref={panelRef}
            className="hp-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hp-contact-title"
          >
            <div className="hp-modal-head">
              <h2 id="hp-contact-title" className="hp-h3">Nous contacter</h2>
              <button type="button" className="hp-menu-btn" onClick={close} aria-label="Fermer">
                <Icon name="close" size={18} />
              </button>
            </div>
            <p className="hp-small" style={{ marginBottom: '0.5rem' }}>
              Quelques questions pour vous répondre utilement, plutôt qu’avec un message type.
            </p>
            <ContactWizard source="page-attente" />
          </div>
        </div>
      ) : null}
    </>
  );
}
