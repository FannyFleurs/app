import Link from 'next/link';
import { loadPlatform } from '@/lib/site/platform';
import { pageMeta, SITE_URL } from '@/lib/site/meta';
import { CASES, TESTIMONIALS } from '@/lib/site/content/showcase';
import { Eyebrow, FinalCta, PageHeader, TextLink } from '../_components/ui';
import Photo from '../_components/Photo';
import Visual from '../_components/Visual';

export const metadata = pageMeta({
  title: 'Cas clients — HelloPos',
  description:
    'Des commerces qui utilisent HelloPos au quotidien : organisation, fonctions utilisées, résultats. Publiés uniquement avec l’accord des commerçants concernés.',
  path: '/clients',
});

export default async function CasesPage() {
  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';
  const price = platform.plan_essentiel_price || '29';
  const trialDays = platform.trial_days || 14;

  return (
    <>
      <PageHeader
        eyebrow="Cas clients"
        title={<>Ils utilisent {brand} au quotidien.</>}
        lede="Des commerces réels, leur organisation, les fonctions qu’ils utilisent vraiment. Rien d’autre."
        crumbs={[
          { href: '/', label: 'Accueil' },
          { href: '/clients', label: 'Cas clients' },
        ]}
        siteUrl={SITE_URL}
      />

      <section className="hp-section--tight">
        <div className="hp-container">
          {CASES.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gap: '2rem',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 20rem), 1fr))',
                marginTop: '2rem',
              }}
            >
              {CASES.map((c) => (
                <article key={c.slug} data-reveal>
                  <Link href={`/clients/${c.slug}`} style={{ textDecoration: 'none', display: 'block' }}>
                    <Photo slot={c.photoSlot ?? `case-${c.slug}`} ratio="landscape" />
                    <h2 className="hp-h3" style={{ marginTop: '1.25rem' }}>{c.shop}</h2>
                    <p className="hp-fine" style={{ marginTop: '0.25rem' }}>
                      {c.city} · {c.activity}
                    </p>
                    <p className="hp-small" style={{ marginTop: '0.75rem' }}>{c.summary}</p>
                    <p className="hp-link" style={{ marginTop: '1rem', display: 'inline-block' }}>
                      Lire le cas client
                      <span className="hp-arrow" aria-hidden="true"> →</span>
                    </p>
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="hp-cols hp-cols--sidebar-rev" style={{ marginTop: '2rem' }}>
              <div data-reveal>
                <Visual
                  slot="clients-intro"
                  screen={{
                    src: '/site/screens/rapports.png',
                    alt: 'Rapports d’activité dans le back-office HelloPos',
                    caption: 'Capture réalisée sur un environnement de démonstration.',
                  }}
                  sizes="(max-width: 900px) 100vw, 55vw"
                />
              </div>
              <div data-reveal>
                <Eyebrow>En cours</Eyebrow>
                <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>
                  Cette page se remplit
                  <br />
                  avec les commerçants.
                </h2>
                <p className="hp-lede" style={{ marginTop: '1.25rem' }}>
                  Nous ne publions ni témoignage, ni chiffre, ni nom de commerce sans l’accord de
                  la personne concernée et sans qu’ils soient exacts. Les premiers cas clients
                  paraîtront ici dès qu’ils auront été relus et validés par les boutiques.
                </p>
                <p className="hp-small" style={{ marginTop: '1.5rem' }}>
                  Chaque cas présentera le commerce, son organisation, les fonctions de {brand}
                  {' '}réellement utilisées, des captures du logiciel et les résultats communiqués
                  par le commerçant.
                </p>
                <p style={{ marginTop: '1.5rem' }}>
                  <TextLink href="/contact">Vous utilisez {brand} ? Racontez-nous</TextLink>
                </p>
              </div>
            </div>
          )}

          {TESTIMONIALS.length > 0 ? (
            <div style={{ marginTop: 'clamp(3rem, 5vw, 5rem)' }}>
              <Eyebrow>Témoignages</Eyebrow>
              <ul style={{ listStyle: 'none', margin: '2rem 0 0', padding: 0, display: 'grid', gap: '2rem' }}>
                {TESTIMONIALS.map((t) => (
                  <li key={`${t.shop}-${t.city}`} className="hp-card">
                    <blockquote className="hp-h4">« {t.quote} »</blockquote>
                    <p className="hp-small" style={{ marginTop: '1rem' }}>
                      <b>{t.shop}</b> — {t.city} · {t.activity}
                      {t.person ? ` · ${t.person.name}, ${t.person.role}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      <FinalCta brand={brand} price={price} trialDays={trialDays} emplacement="clients" />
    </>
  );
}
