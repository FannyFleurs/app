import { notFound } from 'next/navigation';
import { loadPlatform } from '@/lib/site/platform';
import { pageMeta, SITE_URL } from '@/lib/site/meta';
import { CASES, caseBySlug } from '@/lib/site/content/showcase';
import { Eyebrow, FinalCta, PageHeader, TextLink } from '../../_components/ui';
import { Icon } from '../../_components/icons';
import Screen from '../../_components/Screen';
import Photo from '../../_components/Photo';
import { photo } from '@/lib/site/media';
import TrackView from '../../_components/TrackView';

/**
 * Étude de cas.
 *
 * Tant qu'aucun cas n'est publié (lib/site/content/showcase.ts), la route ne
 * répond pour aucun slug : mieux vaut une page absente qu'une page inventée.
 */
export function generateStaticParams() {
  return CASES.map((c) => ({ slug: c.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const study = caseBySlug(params.slug);
  if (!study) {
    return pageMeta({ title: 'Cas clients — HelloPos', description: '', path: '/clients', noIndex: true });
  }
  return pageMeta({
    title: `${study.shop} — Cas client HelloPos`,
    description: study.summary,
    path: `/clients/${study.slug}`,
  });
}

export default async function CasePage({ params }: { params: { slug: string } }) {
  const study = caseBySlug(params.slug);
  if (!study) notFound();

  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';
  const price = platform.plan_essentiel_price || '29';
  const trialDays = platform.trial_days || 14;

  return (
    <>
      <TrackView event="cas_client" props={{ cas: study.slug }} />

      <PageHeader
        eyebrow="Cas client"
        title={study.shop}
        lede={study.summary}
        crumbs={[
          { href: '/', label: 'Accueil' },
          { href: '/clients', label: 'Cas clients' },
          { href: `/clients/${study.slug}`, label: study.shop },
        ]}
        siteUrl={SITE_URL}
      />

      <section className="hp-section--tight">
        <div className="hp-container">
          <p className="hp-small">{study.city} · {study.activity}</p>
          {/* Photo du commerce si elle a été fournie ; sinon la page commence
              directement par le récit, sans cadre vide. */}
          {photo(study.photoSlot ?? `case-${study.slug}`) ? (
            <div style={{ marginTop: '2rem' }} data-reveal>
              <Photo slot={study.photoSlot ?? `case-${study.slug}`} ratio="wide" priority />
            </div>
          ) : null}
        </div>
      </section>

      <section className="hp-section">
        <div className="hp-container hp-cols hp-cols--sidebar">
          <div>
            <Eyebrow>Le commerce</Eyebrow>
          </div>
          <div className="hp-prose">
            {study.context.map((p) => <p key={p.slice(0, 40)}>{p}</p>)}
          </div>
        </div>
      </section>

      <section className="hp-section hp-on-paper">
        <div className="hp-container hp-cols hp-cols--sidebar">
          <div>
            <Eyebrow>La problématique</Eyebrow>
          </div>
          <div className="hp-prose">
            {study.challenge.map((p) => <p key={p.slice(0, 40)}>{p}</p>)}
          </div>
        </div>
      </section>

      <section className="hp-section">
        <div className="hp-container hp-cols hp-cols--sidebar">
          <div>
            <Eyebrow>L’organisation</Eyebrow>
          </div>
          <div>
            <div className="hp-prose">
              {study.organisation.map((p) => <p key={p.slice(0, 40)}>{p}</p>)}
            </div>
            <ul style={{ listStyle: 'none', margin: '2rem 0 0', padding: 0, display: 'grid', gap: '0.6rem' }}>
              {study.featuresUsed.map((f) => (
                <li key={f} style={{ display: 'flex', gap: '0.65rem', alignItems: 'baseline' }}>
                  <span aria-hidden="true" className="hp-yes"><Icon name="check" size={16} /></span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {study.screens?.length ? (
        <section className="hp-section hp-on-green hp-dark">
          <div className="hp-container" style={{ display: 'grid', gap: '2rem' }}>
            {study.screens.map((s) => (
              <Screen key={s.src} src={s.src} alt={s.alt} frame="window" sizes="(max-width: 1000px) 100vw, 900px" />
            ))}
          </div>
        </section>
      ) : null}

      {study.quote ? (
        <section className="hp-section hp-on-gold">
          <div className="hp-container hp-container--text">
            <blockquote className="hp-h2">« {study.quote.text} »</blockquote>
            <p className="hp-small" style={{ marginTop: '1.5rem', color: 'var(--green-deep)' }}>
              {study.quote.author}
            </p>
          </div>
        </section>
      ) : null}

      {study.results?.length ? (
        <section className="hp-section">
          <div className="hp-container">
            <Eyebrow>Résultats</Eyebrow>
            <dl
              style={{
                margin: '2rem 0 0',
                display: 'grid',
                gap: '1rem',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 14rem), 1fr))',
              }}
            >
              {study.results.map((r) => (
                <div key={r.label} className="hp-card">
                  <dt className="hp-small">{r.label}</dt>
                  <dd className="hp-num" style={{ fontSize: '2.5rem', margin: '0.5rem 0 0' }}>{r.value}</dd>
                </div>
              ))}
            </dl>
            <p className="hp-fine" style={{ marginTop: '1.5rem' }}>
              Chiffres communiqués par le commerce, publiés avec son accord.
            </p>
          </div>
        </section>
      ) : null}

      <section className="hp-section--tight">
        <div className="hp-container">
          <TextLink href="/clients">Revenir aux cas clients</TextLink>
        </div>
      </section>

      <FinalCta brand={brand} price={price} trialDays={trialDays} emplacement={`cas-${study.slug}`} />
    </>
  );
}
