import { notFound } from 'next/navigation';
import { loadPlatform } from '@/lib/site/platform';
import { pageMeta, SITE_URL } from '@/lib/site/meta';
import { TRADES, tradeBySlug } from '@/lib/site/content/trades';
import { SEO_PATH_BY_TRADE, TRADE_SLUGS, type TradeSlug } from '@/lib/site/routes';
import { Button, Eyebrow, FinalCta, PageHeader, TextLink } from '../../_components/ui';
import { Icon } from '../../_components/icons';
import Screen from '../../_components/Screen';
import Visual from '../../_components/Visual';
import Faq from '../../_components/Faq';
import TrackView from '../../_components/TrackView';

export function generateStaticParams() {
  return TRADE_SLUGS.map((metier) => ({ metier }));
}

export function generateMetadata({ params }: { params: { metier: string } }) {
  const trade = tradeBySlug(params.metier);
  if (!trade) return pageMeta({ title: 'Solutions — HelloPos', description: '', path: '/solutions' });
  return pageMeta({
    title: `${trade.claim} — HelloPos`,
    description: trade.lede,
    path: `/solutions/${trade.slug}`,
  });
}

export default async function TradePage({ params }: { params: { metier: string } }) {
  const trade = tradeBySlug(params.metier);
  if (!trade) notFound();

  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';
  const price = platform.plan_essentiel_price || '29';
  const trialDays = platform.trial_days || 14;
  const others = TRADES.filter((t) => t.slug !== trade.slug);

  return (
    <>
      <TrackView event="page_metier" props={{ metier: trade.slug }} />

      <PageHeader
        eyebrow={trade.label}
        title={trade.claim}
        lede={trade.lede}
        crumbs={[
          { href: '/', label: 'Accueil' },
          { href: '/solutions', label: 'Solutions' },
          { href: `/solutions/${trade.slug}`, label: trade.label },
        ]}
        siteUrl={SITE_URL}
        actions={
          <>
            <Button href="/setup" track="essai_hellopos" trackProps={{ emplacement: `metier-${trade.slug}` }}>
              Essayer {brand}
            </Button>
            <Button href="/contact#demo" variant="ghost" track="reserver_demo" trackProps={{ emplacement: `metier-${trade.slug}` }}>
              Voir la démo
            </Button>
          </>
        }
      />

      <section className="hp-section--tight">
        <div className="hp-container hp-cols hp-cols--sidebar-rev" style={{ marginTop: '2rem' }}>
          <div data-reveal>
            <Visual slot={trade.photoSlot} screen={trade.screen} sizes="(max-width: 900px) 100vw, 55vw" priority />
          </div>
          <div data-reveal>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {trade.chips.map((c) => (
                <li key={c} className="hp-chip">
                  <Icon name="check" size={14} />
                  {c}
                </li>
              ))}
            </ul>
            <p className="hp-lede" style={{ marginTop: '1.5rem' }}>
              Ce que {brand} change dans une boutique comme la vôtre, fonction par fonction.
            </p>
          </div>
        </div>
      </section>

      <section className="hp-section">
        <div className="hp-container">
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'grid',
              gap: '1rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 18rem), 1fr))',
            }}
          >
            {trade.highlights.map((h, i) => (
              <li
                key={h.title}
                className="hp-card"
                data-reveal
                style={{ ['--reveal-delay' as string]: `${i * 60}ms` }}
              >
                <span aria-hidden="true" style={{ color: 'var(--green)' }}>
                  <Icon name={h.icon} size={22} />
                </span>
                <h2 className="hp-h4" style={{ marginTop: '1rem' }}>{h.title}</h2>
                <p className="hp-small" style={{ marginTop: '0.6rem' }}>{h.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="hp-section hp-on-green hp-dark">
        <div className="hp-container hp-cols hp-cols--sidebar">
          <div data-reveal>
            <Eyebrow>Dans le logiciel</Eyebrow>
            <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>
              L’écran que vous regarderez le plus.
            </h2>
            <p className="hp-lede" style={{ marginTop: '1.25rem' }}>
              Aucune interface n’est mise en scène pour la photo : ce sont les écrans du logiciel,
              tels qu’ils s’ouvrent en boutique.
            </p>
            <p style={{ marginTop: '1.5rem' }}>
              <TextLink href="/fonctionnalites">Voir toutes les fonctionnalités</TextLink>
            </p>
          </div>
          <div data-reveal>
            <Screen src={trade.screen.src} alt={trade.screen.alt} frame="window" crop={trade.screen.crop} sizes="(max-width: 900px) 100vw, 640px" />
          </div>
        </div>
      </section>

      <section className="hp-section hp-on-paper">
        <div className="hp-container hp-cols hp-cols--sidebar">
          <div>
            <Eyebrow>Questions</Eyebrow>
            <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>
              Les questions des {trade.label.toLowerCase()}.
            </h2>
            <p style={{ marginTop: '1.5rem' }}>
              <TextLink href={SEO_PATH_BY_TRADE[trade.slug as TradeSlug]}>
                En savoir plus sur le logiciel de caisse pour {trade.singular}
              </TextLink>
            </p>
          </div>
          <Faq items={trade.seo.faq.map((f) => ({ q: f.q, a: f.a }))} idPrefix={`faq-${trade.slug}`} />
        </div>
      </section>

      <section className="hp-section--tight">
        <div className="hp-container">
          <p className="hp-label">Autres métiers</p>
          <ul style={{ listStyle: 'none', margin: '1.25rem 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {others.map((o) => (
              <li key={o.slug}>
                <a href={`/solutions/${o.slug}`} className="hp-chip">{o.label}</a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <FinalCta brand={brand} price={price} trialDays={trialDays} emplacement={`metier-${trade.slug}`} />
    </>
  );
}
