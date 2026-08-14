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
      className="site-btn site-btn-primary inline-flex items-center justify-center h-12 px-6 rounded-xl text-base font-semibold"
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
      className="site-btn inline-flex items-center justify-center h-12 px-6 rounded-xl text-base font-medium"
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
export function BrowserFrame({ src, alt, className = '', priority = false }: { src: string; alt: string; className?: string; priority?: boolean }) {
  // Variantes WebP responsives (800w mobile, 1600w desktop) générées à côté du
  // PNG d'origine, servi en repli. Dimensions fixées pour éviter tout saut de
  // mise en page (CLS). Le hero passe priority pour charger sans attendre.
  const base = src.replace(/\.png$/, '');
  // Le hero occupe toute la largeur du contenu ; les blocs en deux colonnes ~
  // la moitié. On adapte `sizes` pour que le navigateur choisisse la bonne
  // variante (crisp sur le hero, léger ailleurs).
  const sizes = priority ? '(max-width: 1152px) 100vw, 1152px' : '(max-width: 1024px) 100vw, 600px';
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
      <picture>
        <source
          type="image/webp"
          srcSet={`${base}-m.webp 800w, ${base}.webp 1600w`}
          sizes={sizes}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          width={1440}
          height={900}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          className="w-full h-auto block"
        />
      </picture>
    </div>
  );
}

/** Carte de fonctionnalité : pastille dorée, titre, description. */
export function FeatureCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="site-card rounded-2xl bg-white p-6 border" style={{ borderColor: BORDER }}>
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

/** Rangée de 5 étoiles dorées (n pleines). */
export function Stars({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${n} sur 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"
             fill={i < n ? GOLD_LINE : 'none'} stroke={GOLD_LINE} strokeWidth="1.5">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  );
}

/** Initiales d'un nom (ex. "Camille R." -> "CR"). */
export function initials(name: string): string {
  return name.split(' ').map((p) => p.charAt(0)).join('').slice(0, 2).toUpperCase();
}
