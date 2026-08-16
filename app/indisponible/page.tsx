import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { loadPlatform } from '@/lib/site/platform';
import { spaceUrls } from '@/lib/site/spaces';

export const dynamic = 'force-dynamic';

/**
 * Page d'attente affichée à la racine du domaine public quand le site est
 * dépublié (`SITE_PUBLIC` différent de `on`).
 *
 * Elle dit trois choses, et rien de plus : le site n'est pas accessible en ce
 * moment, les espaces applicatifs le sont toujours, et voici comment nous
 * joindre. Aucune promesse de date, aucun argument commercial.
 *
 * `noindex` : le site n'étant pas publié, il n'a rien à faire dans les
 * résultats de recherche. Le suivi reste autorisé (`follow`) pour que les
 * moteurs retrouvent les pages le jour de la republication.
 */
export const metadata: Metadata = {
  title: 'HelloPos',
  description: 'Le site HelloPos est momentanément indisponible.',
  robots: { index: false, follow: true },
};

export default async function HoldingPage() {
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
        paddingBlock: 'clamp(2.5rem, 6vh, 5rem)',
      }}
    >
      <div className="hp-container">
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
      </div>

      <div className="hp-container">
        <p className="hp-label">Site indisponible</p>
        <h1 className="hp-h1" style={{ marginTop: '1.5rem', maxWidth: '16ch' }}>
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
