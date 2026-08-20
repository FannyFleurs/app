'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './icons';

export interface NavItem {
  href: string;
  label: string;
  hint: string;
}

/**
 * Navigation mobile : un panneau plein écran, ouvert par le bouton menu.
 *
 * Accessibilité : `aria-expanded` sur le bouton, `aria-controls` vers le
 * panneau, fermeture au clavier (Échap), focus renvoyé sur le premier lien à
 * l'ouverture puis sur le bouton à la fermeture, défilement de la page
 * bloqué tant que le panneau est ouvert.
 *
 * Le panneau est monté à la racine `.hp` du site, pas dans l'en-tête : le
 * `backdrop-filter` de celui-ci créerait un bloc conteneur pour les éléments
 * en `position: fixed`, et le panneau se retrouverait enfermé dans la barre.
 * La racine `.hp` porte par ailleurs les variables du design system.
 */
export default function MobileNav({ nav, brand }: { nav: NavItem[]; brand: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [host, setHost] = useState<Element | null>(null);

  useEffect(() => {
    setHost(document.querySelector('.hp'));
  }, []);

  // Toute navigation ferme le panneau.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLAnchorElement>('a')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="hp-menu-btn"
        aria-expanded={open}
        aria-controls="hp-menu"
        aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={open ? 'close' : 'menu'} size={20} />
      </button>

      {host
        ? createPortal(
      <div
        id="hp-menu"
        ref={panelRef}
        className="hp-drawer"
        hidden={!open}
        role="dialog"
        aria-modal="true"
        aria-label={`Menu ${brand}`}
      >
        <div className="hp-container" style={{ paddingTop: '1.5rem', paddingBottom: '3rem' }}>
          <div className="flex items-center justify-between" style={{ height: '3rem' }}>
            <span className="hp-label hp-label--plain">Menu</span>
            <button
              type="button"
              className="hp-menu-btn"
              onClick={() => {
                setOpen(false);
                btnRef.current?.focus();
              }}
              aria-label="Fermer le menu"
            >
              <Icon name="close" size={20} />
            </button>
          </div>

          <nav className="hp-drawer-nav" style={{ marginTop: '1.5rem' }} aria-label="Navigation principale">
            {nav.map((n) => (
              <Link key={n.href} href={n.href}>
                {n.label}
                <span>{n.hint}</span>
              </Link>
            ))}
          </nav>

          <div style={{ marginTop: '2rem', display: 'grid', gap: '0.75rem' }}>
            <a className="hp-btn hp-btn--primary hp-btn--block" href="/setup" data-track="essai_hellopos">
              Créer ma caisse
            </a>
            <Link className="hp-btn hp-btn--ghost hp-btn--block" href="/contact" data-track="reserver_demo">
              Voir la démo
            </Link>
            <Link className="hp-btn hp-btn--ghost hp-btn--block" href="/connexion">
              Connexion
            </Link>
          </div>
        </div>
      </div>,
            host,
          )
        : null}
    </>
  );
}
