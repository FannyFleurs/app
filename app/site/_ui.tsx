import Link from 'next/link';

/**
 * Briques d'interface partagées par les pages du site vitrine. Aux couleurs
 * de la marque : vert profond #013E37, or #FFEFB3, ivoire #F8F6F0.
 */

export const GREEN = '#013E37';
export const GREEN_DEEP = '#012B26';
export const GOLD = '#FFEFB3';
export const GOLD_LINE = '#E9C46A';
export const IVORY = '#F8F6F0';
export const BORDER = '#E7E3D8';

/** Petit intitulé en capitales, doré, au-dessus d'un titre de section. */
export function Eyebrow({ children, onDark = false }: { children: React.ReactNode; onDark?: boolean }) {
  return (
    <span
      className="inline-block text-xs font-semibold uppercase tracking-[0.2em]"
      style={{ color: onDark ? GOLD : GREEN, opacity: onDark ? 0.9 : 0.75 }}
    >
      {children}
    </span>
  );
}

/** Bouton principal (vert plein). */
export function ButtonPrimary({ href, children, onDark = false }: { href: string; children: React.ReactNode; onDark?: boolean }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center h-12 px-6 rounded-xl text-base font-semibold transition-transform active:scale-95"
      style={onDark
        ? { backgroundColor: GOLD, color: GREEN_DEEP }
        : { backgroundColor: GREEN, color: '#fff' }}
    >
      {children}
    </Link>
  );
}

/** Bouton secondaire (contour). */
export function ButtonGhost({ href, children, onDark = false }: { href: string; children: React.ReactNode; onDark?: boolean }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center h-12 px-6 rounded-xl text-base font-medium transition-colors"
      style={onDark
        ? { color: GOLD, border: `1px solid ${GOLD_LINE}` }
        : { color: GREEN, border: `1px solid ${BORDER}`, backgroundColor: '#fff' }}
    >
      {children}
    </Link>
  );
}

/**
 * Cadre « fenêtre » autour d'une capture d'écran : trois pastilles, un léger
 * relief, l'image dedans. Donne à la capture l'air d'un vrai logiciel.
 */
export function BrowserFrame({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  return (
    <div
      className={`rounded-2xl overflow-hidden border shadow-2xl ${className}`}
      style={{ borderColor: BORDER, boxShadow: '0 30px 60px -20px rgba(1,43,38,0.35)' }}
    >
      <div className="flex items-center gap-1.5 px-4 h-9 border-b" style={{ backgroundColor: '#fff', borderColor: BORDER }}>
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: '#F4A09B' }} />
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: '#F0C25A' }} />
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: '#7AD09A' }} />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="w-full h-auto block" />
    </div>
  );
}

/** Carte de fonctionnalité : pastille dorée, titre, description. */
export function FeatureCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-6 border" style={{ borderColor: BORDER }}>
      <div className="grid h-11 w-11 place-items-center rounded-xl" style={{ backgroundColor: GOLD, color: GREEN_DEEP }}>
        {icon}
      </div>
      <h3 className="mt-4 font-semibold text-lg" style={{ color: '#14211D' }}>{title}</h3>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: '#5A625E' }}>{children}</p>
    </div>
  );
}

/** Icône SVG simple (trait), 22px. */
export function Icon({ path }: { path: React.ReactNode }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {path}
    </svg>
  );
}
