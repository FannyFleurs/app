import Link from 'next/link';

/**
 * Logo HelloPos.
 *
 * Le logo officiel est celui configuré par l'éditeur dans la console
 * d'administration (`platform_settings.logo_url`) : quand il est renseigné,
 * c'est lui qui s'affiche, jamais un dessin de remplacement. Sinon, on reprend
 * la marque déjà utilisée dans l'application — le monogramme sur fond vert
 * suivi du nom — sans inventer d'autre signe.
 */
export default function Logo({
  brand,
  logoUrl,
  href = '/',
  onDark = false,
}: {
  brand: string;
  logoUrl?: string;
  href?: string;
  onDark?: boolean;
}) {
  const content = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt={brand}
      width={160}
      height={36}
      style={{ height: '2.1rem', width: 'auto', maxWidth: '11rem', objectFit: 'contain' }}
    />
  ) : (
    <>
      <span className="hp-logo-mark" aria-hidden="true">
        {brand.charAt(0).toUpperCase()}
      </span>
      <span className="hp-logo-word">{brand}</span>
    </>
  );

  return (
    <Link href={href} className={`hp-logo${onDark ? ' hp-dark' : ''}`} aria-label={`${brand} — accueil`}>
      {content}
    </Link>
  );
}
