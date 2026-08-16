import { loadPlatform } from '@/lib/site/platform';
import { pageMeta, SITE_URL } from '@/lib/site/meta';
import { ONBOARDING } from '@/lib/site/content/home';
import { Eyebrow, PageHeader, TextLink } from '../_components/ui';
import { Icon } from '../_components/icons';
import ContactWizard from '../_components/ContactWizard';

export const metadata = pageMeta({
  title: 'Contact — HelloPos',
  description:
    'Réserver une démonstration de HelloPos, vérifier votre matériel, poser une question sur les tarifs ou le multi-boutiques. Une réponse d’une personne, pas d’un robot.',
  path: '/contact',
});

export default async function ContactPage({
  searchParams,
}: {
  searchParams?: { sujet?: string };
}) {
  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';

  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title={<>Parlons de votre commerce.</>}
        lede={`Une démonstration, une question de matériel, un projet à plusieurs boutiques : écrivez-nous, nous répondons.`}
        crumbs={[
          { href: '/', label: 'Accueil' },
          { href: '/contact', label: 'Contact' },
        ]}
        siteUrl={SITE_URL}
      />

      <section className="hp-section--tight" id="demo" style={{ scrollMarginTop: '5.5rem' }}>
        <div className="hp-container hp-cols hp-cols--sidebar-rev" style={{ marginTop: '2rem', alignItems: 'start' }}>
          <div>
            <ContactWizard source={searchParams?.sujet ?? 'contact'} />
          </div>

          <aside style={{ display: 'grid', gap: '2rem' }}>
            <div>
              <Eyebrow>Comment ça se passe</Eyebrow>
              <ol style={{ listStyle: 'none', margin: '1.25rem 0 0', padding: 0, display: 'grid', gap: '1rem' }}>
                {ONBOARDING.map((s) => (
                  <li key={s.index} style={{ display: 'flex', gap: '0.9rem' }}>
                    <span className="hp-story-index">{s.index}</span>
                    <span>
                      <b style={{ fontWeight: 550 }}>{s.title}</b>
                      <span className="hp-small" style={{ display: 'block' }}>{s.text}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="hp-card">
              <h2 className="hp-h4">Nous joindre directement</h2>
              <ul style={{ listStyle: 'none', margin: '1rem 0 0', padding: 0, display: 'grid', gap: '0.6rem' }}>
                {platform.contact_email ? (
                  <li style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    <span aria-hidden="true" style={{ color: 'var(--green)' }}><Icon name="mail" size={18} /></span>
                    <a className="hp-link" href={`mailto:${platform.contact_email}`}>{platform.contact_email}</a>
                  </li>
                ) : null}
                {platform.contact_phone ? (
                  <li style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    <span aria-hidden="true" style={{ color: 'var(--green)' }}><Icon name="phone" size={18} /></span>
                    <a className="hp-link" href={`tel:${platform.contact_phone.replace(/\s/g, '')}`}>
                      {platform.contact_phone}
                    </a>
                  </li>
                ) : null}
                {!platform.contact_email && !platform.contact_phone ? (
                  <li className="hp-small">
                    Le formulaire est le moyen le plus sûr de nous joindre : chaque demande est
                    enregistrée, aucune ne se perd.
                  </li>
                ) : null}
              </ul>
            </div>

            <div>
              <p className="hp-small">
                Vous préférez essayer d’abord ? La création de votre espace prend quelques minutes.
              </p>
              <p style={{ marginTop: '0.75rem' }}>
                <TextLink href="/setup" track="essai_hellopos">Créer mon espace {brand}</TextLink>
              </p>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
