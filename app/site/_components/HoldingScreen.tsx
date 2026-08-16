import { headers } from 'next/headers';
import { loadPlatform } from '@/lib/site/platform';
import { spaceUrls } from '@/lib/site/spaces';

/**
 * Écran affiché tant que le site public n'est pas activé.
 *
 * Il porte le titre de l'accueil — la marque, pas un message d'erreur — puis
 * les accès applicatifs et les coordonnées. Aucun avis d'indisponibilité,
 * aucune promesse de date.
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
        {/* Le titre de la marque, celui de l'accueil : la page tient debout
            toute seule, sans message d'indisponibilité. */}
        <h1 className="hp-display" style={{ maxWidth: '14ch' }}>
          La caisse qui
          <br />
          fait <span className="hp-em">beaucoup plus</span>
          <br />
          que la caisse.
        </h1>
        <p className="hp-h4" style={{ marginTop: '2.25rem' }}>
          Encaissez. Gérez. Pilotez. Grandissez.
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
