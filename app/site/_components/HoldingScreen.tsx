import { headers } from 'next/headers';
import { loadPlatform } from '@/lib/site/platform';
import { spaceUrls } from '@/lib/site/spaces';

/**
 * Écran affiché tant que le site public n'est pas activé.
 *
 * Il dit trois choses, et rien de plus : le site n'est pas accessible en ce
 * moment, les espaces applicatifs le sont toujours, et voici comment nous
 * joindre. Aucune promesse de date, aucun argument commercial.
 *
 * Servi à la racine du domaine public (le gabarit du site le rend à la place
 * de l'accueil) et sur la route /indisponible, qui permet de le relire depuis
 * la console d'administration.
 */
export default async function HoldingScreen() {
  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';
  const urls = spaceUrls(headers().get('host'));
  const year = new Date().getFullYear();

  const legal = [
    platform.company_legal_name,
    platform.company_siret ? `SIRET ${platform.company_siret}` : '',
    platform.company_vat ? `TVA ${platform.company_vat}` : '',
  ].filter(Boolean);

  return (
    <main
      style={{
        minHeight: '100svh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '3rem',
        paddingBlock: 'clamp(1.5rem, 4vh, 2.5rem) clamp(2.5rem, 6vh, 4rem)',
      }}
    >
      <div
        className="hp-container"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}
      >
        <span className="hp-logo hp-dark" aria-label={brand}>
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

      <div className="hp-container">
        <h1 className="hp-h1" style={{ maxWidth: '16ch' }}>
          Le site {brand} n’est pas accessible pour le moment.
        </h1>
        <p className="hp-lede" style={{ marginTop: '1.5rem', maxWidth: '48ch' }}>
          Les boutiques équipées continuent d’encaisser et de piloter leur activité normalement :
          la caisse, le back-office et les écrans ne sont pas concernés.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem', marginTop: '2.5rem' }}>
          <a className="hp-btn hp-btn--gold hp-btn--lg" href={urls.caisse}>
            Ouvrir la caisse
          </a>
          <a className="hp-btn hp-btn--ghost hp-btn--lg" href={urls.bo}>
            Ouvrir le back-office
          </a>
        </div>

        {platform.contact_email || platform.contact_phone ? (
          <p className="hp-small" style={{ marginTop: '2.5rem' }}>
            Une question, un besoin&nbsp;?{' '}
            {platform.contact_email ? (
              <a className="hp-link" href={`mailto:${platform.contact_email}`}>
                {platform.contact_email}
              </a>
            ) : null}
            {platform.contact_email && platform.contact_phone ? <span aria-hidden="true"> · </span> : null}
            {platform.contact_phone ? (
              <a className="hp-link" href={`tel:${platform.contact_phone.replace(/\s/g, '')}`}>
                {platform.contact_phone}
              </a>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className="hp-container">
        <hr className="hp-rule" style={{ marginBottom: '1.25rem' }} />
        <p className="hp-fine">
          © {year} {brand}
          {legal.length ? ` — ${legal.join(' · ')}` : ''}
        </p>
      </div>
    </main>
  );
}
