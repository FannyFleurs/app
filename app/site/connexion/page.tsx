import { headers } from 'next/headers';
import { loadPlatform } from '@/lib/site/platform';
import { pageMeta, SITE_URL } from '@/lib/site/meta';
import { Button, Eyebrow, PageHeader, TextLink } from '../_components/ui';
import { Icon } from '../_components/icons';
import { spaceUrls } from '@/lib/site/spaces';

export const metadata = pageMeta({
  title: 'Connexion — HelloPos',
  description:
    'Accéder à votre caisse HelloPos, à votre back-office, à l’écran atelier ou au suivi du chiffre d’affaires.',
  path: '/connexion',
  noIndex: true,
});

export default async function LoginChoicePage() {
  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';
  const urls = spaceUrls(headers().get('host'));

  const secondary = [
    { href: urls.ca, label: 'Suivi du chiffre d’affaires', text: 'L’écran qui affiche l’activité du jour en direct.', icon: 'chart' },
    { href: urls.ecran, label: 'Écran atelier', text: 'Les commandes à préparer, affichées au mur.', icon: 'workshop' },
    { href: urls.pda, label: 'PDA étiquettes', text: 'La station portable d’impression d’étiquettes.', icon: 'pda' },
  ].filter((s) => Boolean(s.href));

  return (
    <>
      <PageHeader
        eyebrow="Connexion"
        title={<>Où souhaitez-vous aller ?</>}
        lede={`${brand} se décline en plusieurs espaces. Chacun a sa page de connexion.`}
        crumbs={[
          { href: '/', label: 'Accueil' },
          { href: '/connexion', label: 'Connexion' },
        ]}
        siteUrl={SITE_URL}
      />

      <section className="hp-section--tight">
        <div className="hp-container">
          <div
            style={{
              display: 'grid',
              gap: '1rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 18rem), 1fr))',
              marginTop: '2rem',
            }}
          >
            <div className="hp-card">
              <span aria-hidden="true" style={{ color: 'var(--green)' }}><Icon name="cart" size={24} /></span>
              <h2 className="hp-h3" style={{ marginTop: '1rem' }}>La caisse</h2>
              <p className="hp-small" style={{ marginTop: '0.6rem' }}>
                L’écran de vente, sur la tablette du comptoir. Connexion avec votre code vendeur.
              </p>
              <p style={{ marginTop: '1.5rem' }}>
                <Button href={urls.caisse}>Ouvrir la caisse</Button>
              </p>
            </div>

            <div className="hp-card">
              <span aria-hidden="true" style={{ color: 'var(--green)' }}><Icon name="chart" size={24} /></span>
              <h2 className="hp-h3" style={{ marginTop: '1rem' }}>Le back-office</h2>
              <p className="hp-small" style={{ marginTop: '0.6rem' }}>
                Catalogue, stocks, clients, rapports et réglages. Connexion avec votre email et
                votre mot de passe.
              </p>
              <p style={{ marginTop: '1.5rem' }}>
                <Button href={urls.bo} variant="ghost">Ouvrir le back-office</Button>
              </p>
            </div>
          </div>

          {secondary.length ? (
            <div style={{ marginTop: 'clamp(2.5rem, 4vw, 4rem)' }}>
              <Eyebrow>Autres espaces</Eyebrow>
              <ul style={{ listStyle: 'none', margin: '1.5rem 0 0', padding: 0, display: 'grid', gap: '0.25rem' }}>
                {secondary.map((s) => (
                  <li key={s.label} style={{ borderTop: '1px solid var(--line)', paddingBlock: '1rem' }}>
                    <a href={s.href ?? '#'} style={{ display: 'flex', gap: '0.9rem', textDecoration: 'none' }}>
                      <span aria-hidden="true" style={{ color: 'var(--ink-faint)' }}>
                        <Icon name={s.icon} size={20} />
                      </span>
                      <span>
                        <b style={{ fontWeight: 550 }}>{s.label}</b>
                        <span className="hp-small" style={{ display: 'block' }}>{s.text}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="hp-card" style={{ marginTop: 'clamp(2.5rem, 4vw, 4rem)' }}>
            <h2 className="hp-h4">Pas encore de compte ?</h2>
            <p className="hp-small" style={{ marginTop: '0.5rem' }}>
              La création de votre espace prend quelques minutes : société, boutique, caisse, TVA.
            </p>
            <p style={{ marginTop: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
              <TextLink href="/setup" track="essai_hellopos">Créer mon espace</TextLink>
              <TextLink href="/contact">Nous écrire</TextLink>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
