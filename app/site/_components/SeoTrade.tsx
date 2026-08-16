import { loadPlatform } from '@/lib/site/platform';
import { SITE_URL } from '@/lib/site/meta';
import { tradeBySlug } from '@/lib/site/content/trades';
import { SEO_PATH_BY_TRADE, type TradeSlug } from '@/lib/site/routes';
import { Button, Eyebrow, FinalCta, PageHeader, TextLink } from './ui';
import { Icon } from './icons';
import Screen from './Screen';
import Visual from './Visual';
import Faq from './Faq';
import TrackView from './TrackView';

/**
 * Page métier orientée recherche (« logiciel de caisse pour … »).
 *
 * Le contenu vient de `TRADES[].seo` : chaque métier a ses propres textes,
 * ses propres exemples et ses propres questions. Ce composant n'apporte que
 * la mise en page — il ne duplique aucun contenu d'un métier à l'autre.
 */
export default async function SeoTrade({ slug }: { slug: TradeSlug }) {
  const trade = tradeBySlug(slug);
  if (!trade) return null;
  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';
  const price = platform.plan_essentiel_price || '29';
  const trialDays = platform.trial_days || 14;
  const seo = trade.seo;

  return (
    <>
      <TrackView event="page_metier" props={{ metier: trade.slug, type: 'seo' }} />

      <PageHeader
        eyebrow={trade.label}
        title={seo.h1}
        lede={seo.intro[0]}
        crumbs={[
          { href: '/', label: 'Accueil' },
          { href: '/solutions', label: 'Solutions' },
          { href: SEO_PATH_BY_TRADE[slug], label: seo.h1 },
        ]}
        siteUrl={SITE_URL}
        actions={
          <>
            <Button href="/setup" track="essai_hellopos" trackProps={{ emplacement: `seo-${trade.slug}` }}>
              Essayer {brand}
            </Button>
            <Button href="/tarifs" variant="ghost" track="voir_tarifs" trackProps={{ emplacement: `seo-${trade.slug}` }}>
              Voir les tarifs
            </Button>
          </>
        }
      />

      <section className="hp-section--tight">
        <div className="hp-container hp-cols hp-cols--sidebar-rev" style={{ marginTop: '2rem' }}>
          <div data-reveal>
            <Screen src={trade.screen.src} alt={trade.screen.alt} frame="window" crop={trade.screen.crop} sizes="(max-width: 900px) 100vw, 600px" />
          </div>
          <div className="hp-prose" data-reveal>
            {seo.intro.slice(1).map((p) => (
              <p key={p.slice(0, 40)}>{p}</p>
            ))}
            <ul style={{ listStyle: 'none', margin: '1.5rem 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {trade.chips.map((c) => (
                <li key={c} className="hp-chip">{c}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {seo.sections.map((s, i) => (
        <section key={s.h2} className={`hp-section${i % 2 === 1 ? ' hp-on-paper' : ''}`}>
          <div className="hp-container hp-cols hp-cols--sidebar">
            <div data-reveal>
              <Eyebrow>{`0${i + 1}`}</Eyebrow>
              <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>{s.h2}</h2>
            </div>
            <div className="hp-prose" data-reveal>
              {s.body.map((p) => (
                <p key={p.slice(0, 40)}>{p}</p>
              ))}
              {s.bullets ? (
                <ul style={{ listStyle: 'none', margin: '1.5rem 0 0', padding: 0, display: 'grid', gap: '0.6rem' }}>
                  {s.bullets.map((b) => (
                    <li key={b} style={{ display: 'flex', gap: '0.65rem', alignItems: 'baseline' }}>
                      <span aria-hidden="true" className="hp-yes">
                        <Icon name="check" size={16} />
                      </span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </section>
      ))}

      <section className="hp-section hp-on-green hp-dark">
        <div className="hp-container hp-cols hp-cols--sidebar-rev">
          <div data-reveal>
            <Visual
              slot={trade.photoSlot}
              screen={{
                src: '/site/screens/ma-journee.png',
                alt: 'Écran « Ma journée » de HelloPos',
                caption: 'Capture réalisée sur un environnement de démonstration.',
              }}
              sizes="(max-width: 900px) 100vw, 50vw"
            />
          </div>
          <div data-reveal>
            <Eyebrow>Le prix</Eyebrow>
            <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>
              Dès {price} € HT/mois, tout compris.
            </h2>
            <p className="hp-lede" style={{ marginTop: '1.25rem' }}>
              L’offre d’entrée couvre une boutique et une caisse, avec l’ensemble du logiciel :
              catalogue, stocks, commandes, clients, fidélité, rapports et exports.
              {' '}
              {trialDays} jours d’essai, sans engagement.
            </p>
            <p style={{ marginTop: '1.5rem' }}>
              <TextLink href="/tarifs" track="voir_tarifs">Comparer les formules</TextLink>
            </p>
          </div>
        </div>
      </section>

      <section className="hp-section hp-on-paper">
        <div className="hp-container hp-cols hp-cols--sidebar">
          <div>
            <Eyebrow>Questions</Eyebrow>
            <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>
              {seo.h1} : vos questions.
            </h2>
            <ul style={{ listStyle: 'none', margin: '2rem 0 0', padding: 0, display: 'grid', gap: '0.75rem' }}>
              <li><TextLink href={`/solutions/${trade.slug}`}>{trade.claim}</TextLink></li>
              <li><TextLink href="/fonctionnalites">Toutes les fonctionnalités</TextLink></li>
              <li><TextLink href="/materiel">Le matériel compatible</TextLink></li>
              <li><TextLink href="/conformite">La conformité fiscale</TextLink></li>
            </ul>
          </div>
          <Faq items={seo.faq.map((f) => ({ q: f.q, a: f.a }))} idPrefix={`faq-seo-${trade.slug}`} />
        </div>
      </section>

      <FinalCta
        brand={brand}
        price={price}
        trialDays={trialDays}
        emplacement={`seo-${trade.slug}`}
        title={<>{brand} pour votre {trade.singular}.</>}
      />
    </>
  );
}
