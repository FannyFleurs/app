import Link from 'next/link';
import { Icon } from './icons';

/**
 * Primitives d'interface du site : bouton, intitulé de section, fil
 * d'Ariane, séparateurs. Tout passe par le design system (site.css) ; aucun
 * style en dur n'est écrit ici.
 */

/** Chemins servis en dehors du site vitrine : navigation document complète. */
const APP_PATHS = ['/setup', '/login', '/bo', '/caisse', '/dashboard'];

function isAppPath(href: string): boolean {
  return APP_PATHS.some((p) => href === p || href.startsWith(`${p}/`) || href.startsWith(`${p}?`));
}

export interface ButtonProps {
  href: string;
  children: React.ReactNode;
  /** `primary` par défaut sur fond clair, `gold` sur fond vert. */
  variant?: 'primary' | 'gold' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  /** Nom d'événement analytics (voir lib/site/analytics.ts). */
  track?: string;
  trackProps?: Record<string, string | number>;
  className?: string;
  /** Flèche animée en fin de libellé. */
  arrow?: boolean;
}

export function Button({
  href,
  children,
  variant = 'primary',
  size = 'md',
  track,
  trackProps,
  className = '',
  arrow = false,
}: ButtonProps) {
  const cls = [
    'hp-btn',
    `hp-btn--${variant}`,
    size === 'sm' ? 'hp-btn--sm' : size === 'lg' ? 'hp-btn--lg' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const attrs = {
    className: cls,
    'data-track': track,
    'data-track-props': trackProps ? JSON.stringify(trackProps) : undefined,
  };
  const content = (
    <>
      {children}
      {arrow ? <span className="hp-arrow" aria-hidden="true">→</span> : null}
    </>
  );
  if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:') || isAppPath(href)) {
    return (
      <a href={href} {...attrs}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} {...attrs}>
      {content}
    </Link>
  );
}

/** Lien texte souligné, avec flèche optionnelle. */
export function TextLink({
  href,
  children,
  track,
  arrow = true,
  className = '',
}: {
  href: string;
  children: React.ReactNode;
  track?: string;
  arrow?: boolean;
  className?: string;
}) {
  const inner = (
    <>
      {children}
      {arrow ? <span className="hp-arrow" aria-hidden="true"> →</span> : null}
    </>
  );
  const cls = `hp-link ${className}`.trim();
  if (href.startsWith('http') || isAppPath(href)) {
    return (
      <a href={href} className={cls} data-track={track}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={cls} data-track={track}>
      {inner}
    </Link>
  );
}

/** Intitulé de section, en capitales, précédé d'un trait. */
export function Eyebrow({ children, plain = false }: { children: React.ReactNode; plain?: boolean }) {
  return <p className={`hp-label${plain ? ' hp-label--plain' : ''}`}>{children}</p>;
}

/** Ligne de réassurance : « Dès 29 € HT/mois · 14 jours gratuits · Sans engagement ». */
export function Reassurance({ items, className = '' }: { items: string[]; className?: string }) {
  return (
    <p className={`hp-small ${className}`.trim()}>
      {items.map((item, i) => (
        <span key={item}>
          {i > 0 ? <span aria-hidden="true"> · </span> : null}
          {item}
        </span>
      ))}
    </p>
  );
}

/** Puce de liste avec coche. */
export function Tick({ children }: { children: React.ReactNode }) {
  return (
    <li>
      <span className="hp-yes" aria-hidden="true">
        <Icon name="check" size={16} />
      </span>
      <span>{children}</span>
    </li>
  );
}

/**
 * En-tête de page intérieure : fil d'Ariane, intitulé, titre, chapô,
 * actions. Le même bloc partout — c'est ce qui tient le site ensemble.
 */
export function PageHeader({
  eyebrow,
  title,
  lede,
  crumbs,
  siteUrl,
  actions,
  tone = 'light',
}: {
  eyebrow: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  crumbs: Crumb[];
  siteUrl: string;
  actions?: React.ReactNode;
  tone?: 'light' | 'green';
}) {
  const dark = tone === 'green';
  return (
    <section className={dark ? 'hp-section--tight hp-on-green hp-dark' : 'hp-section--tight'}>
      <div className="hp-container" style={{ paddingBlock: dark ? undefined : '2.5rem 0' }}>
        <Breadcrumbs items={crumbs} siteUrl={siteUrl} />
        <p className="hp-label" style={{ marginTop: '2rem' }}>{eyebrow}</p>
        <h1 className="hp-h1" style={{ marginTop: '1.25rem', maxWidth: '18ch' }}>
          {title}
        </h1>
        {lede ? (
          <p className="hp-lede" style={{ marginTop: '1.5rem', maxWidth: '46ch' }}>
            {lede}
          </p>
        ) : null}
        {actions ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem', marginTop: '2rem' }}>{actions}</div>
        ) : null}
      </div>
    </section>
  );
}

export interface Crumb {
  href: string;
  label: string;
}

/**
 * Bloc de conversion final, repris à l'identique en bas de chaque page :
 * un fond vert, deux actions, une ligne de réassurance. Rien d'autre.
 */
export function FinalCta({
  brand,
  price,
  trialDays,
  title,
  lede,
  emplacement,
}: {
  brand: string;
  price: string;
  trialDays: number;
  title?: React.ReactNode;
  lede?: React.ReactNode;
  emplacement: string;
}) {
  return (
    <section className="hp-section hp-on-green hp-dark">
      <div className="hp-container" style={{ textAlign: 'center' }}>
        <h2 className="hp-h1">
          {title ?? (
            <>
              Votre commerce.
              <br />
              Une seule application.
            </>
          )}
        </h2>
        <p className="hp-lede" style={{ marginTop: '1.5rem', marginInline: 'auto', maxWidth: '34ch' }}>
          {lede ?? `Essayez ${brand} pendant ${trialDays} jours.`}
        </p>
        <div
          style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.9rem', marginTop: '2.5rem' }}
        >
          <Button href="/setup" variant="gold" size="lg" track="essai_hellopos" trackProps={{ emplacement }}>
            Commencer gratuitement
          </Button>
          <Button href="/contact#demo" variant="ghost" size="lg" track="reserver_demo" trackProps={{ emplacement }}>
            Réserver une démo
          </Button>
        </div>
        <Reassurance className="mt-6" items={[`Dès ${price} € HT/mois`, 'Sans engagement']} />
      </div>
    </section>
  );
}

/** Fil d'Ariane visible + données structurées BreadcrumbList. */
export function Breadcrumbs({ items, siteUrl }: { items: Crumb[]; siteUrl: string }) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      item: `${siteUrl}${c.href === '/' ? '' : c.href}`,
    })),
  };
  return (
    <nav aria-label="Fil d’Ariane">
      <ol className="hp-crumbs">
        {items.map((c, i) => (
          <li key={c.href} className="flex items-center gap-2">
            {i > 0 ? <span aria-hidden="true">/</span> : null}
            {i === items.length - 1 ? (
              <span aria-current="page">{c.label}</span>
            ) : (
              <Link href={c.href}>{c.label}</Link>
            )}
          </li>
        ))}
      </ol>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </nav>
  );
}
