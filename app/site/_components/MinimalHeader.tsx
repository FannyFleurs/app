import { headers } from 'next/headers';
import { loadPlatform } from '@/lib/site/platform';
import { spaceUrls } from '@/lib/site/spaces';

/**
 * En-tête réduit : le logo, et un accès à la connexion.
 *
 * Utilisé quand le site n'est pas publié — sur l'écran d'accueil d'attente et
 * sur les pages légales, qui restent servies. Aucune navigation vers des
 * pages qui ne répondent pas : il n'y a rien de pire qu'un menu qui ramène
 * toujours au même endroit.
 */
export default async function MinimalHeader({ onDark = false }: { onDark?: boolean }) {
  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';
  const urls = spaceUrls(headers().get('host'));

  return (
    <div
      className="hp-container"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}
    >
      <span className={`hp-logo${onDark ? ' hp-dark' : ''}`} aria-label={brand}>
        {platform.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={platform.logo_url}
            alt={brand}
            style={{ height: '2.1rem', width: 'auto', maxWidth: '11rem', objectFit: 'contain' }}
          />
        ) : (
          <>
            <span className="hp-logo-mark" aria-hidden="true">{brand.charAt(0).toUpperCase()}</span>
            <span className="hp-logo-word">{brand}</span>
          </>
        )}
      </span>

      <a className="hp-btn hp-btn--ghost hp-btn--sm" href={urls.caisse}>
        Connexion
      </a>
    </div>
  );
}
