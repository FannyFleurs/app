'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const GREEN = '#013E37';
const BORDER = '#E7E3D8';
const IVORY = '#F8F6F0';

/**
 * Menu mobile / tablette du site vitrine (< lg). Bouton hamburger + tiroir
 * latéral avec la navigation et les appels à l'action. Cibles tactiles
 * larges (48 px), fermeture au clic sur un lien, sur le voile, ou avec Échap,
 * et défilement du fond verrouillé quand le tiroir est ouvert.
 */
export default function MobileMenu({ nav }: { nav: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  // Le tiroir est monté dans <body> (portail) : il échappe ainsi au
  // backdrop-filter de l'en-tête, qui sinon piège le positionnement fixed.
  useEffect(() => { setMounted(true); }, []);

  // Referme à chaque navigation.
  useEffect(() => { setOpen(false); }, [pathname]);

  // Verrouille le défilement du fond + fermeture au clavier (Échap).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label="Ouvrir le menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="grid h-11 w-11 place-items-center rounded-xl transition-colors hover:bg-black/5"
        style={{ color: GREEN }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {mounted && open && createPortal(
        <div className="site-root fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute right-0 top-0 h-full w-[85%] max-w-xs flex flex-col shadow-2xl"
            style={{ backgroundColor: IVORY }}
          >
            <div className="h-16 shrink-0 flex items-center justify-between px-5 border-b" style={{ borderColor: BORDER }}>
              <span className="text-sm font-semibold uppercase tracking-widest" style={{ color: GREEN }}>Menu</span>
              <button
                type="button"
                aria-label="Fermer le menu"
                onClick={() => setOpen(false)}
                className="grid h-11 w-11 place-items-center rounded-xl transition-colors hover:bg-black/5"
                style={{ color: GREEN }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-4 flex flex-col gap-1">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="flex items-center h-12 px-4 rounded-xl text-base font-medium transition-colors hover:bg-black/5"
                  style={{ color: '#14211D' }}
                >
                  {n.label}
                </Link>
              ))}
            </nav>

            <div className="p-4 border-t flex flex-col gap-2.5" style={{ borderColor: BORDER }}>
              <a
                href="/login"
                className="site-btn flex items-center justify-center h-12 rounded-xl text-base font-medium"
                style={{ color: GREEN, border: `1px solid ${BORDER}`, backgroundColor: '#fff' }}
              >
                Se connecter
              </a>
              <Link
                href="/contact"
                className="site-btn flex items-center justify-center h-12 rounded-xl text-base font-semibold text-white"
                style={{ backgroundColor: GREEN }}
              >
                Demander une démo
              </Link>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
