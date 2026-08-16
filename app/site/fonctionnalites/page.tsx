import { loadPlatform } from '@/lib/site/platform';
import { pageMeta, SITE_URL } from '@/lib/site/meta';
import { FEATURE_SECTIONS, FEATURE_GROUPS } from '@/lib/site/content/features';
import { Button, Eyebrow, FinalCta, PageHeader, TextLink } from '../_components/ui';
import { Icon } from '../_components/icons';
import Screen from '../_components/Screen';

export const metadata = pageMeta({
  title: 'Fonctionnalités — HelloPos',
  description:
    'Encaissement, stocks, commandes et livraisons, clients et fidélité, facturation, pilotage, multi-boutiques et comptabilité : tout ce que fait HelloPos, écran par écran.',
  path: '/fonctionnalites',
});

export default async function FeaturesPage() {
  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';
  const price = platform.plan_essentiel_price || '29';
  const trialDays = platform.trial_days || 14;

  return (
    <>
      <PageHeader
        eyebrow="Fonctionnalités"
        title={<>Tout ce qu’il faut. Là où il faut.</>}
        lede={`${brand} couvre la journée entière d’un commerce : vendre, préparer, gérer, fidéliser, piloter, grandir. Voici les écrans, sans mise en scène.`}
        crumbs={[
          { href: '/', label: 'Accueil' },
          { href: '/fonctionnalites', label: 'Fonctionnalités' },
        ]}
        siteUrl={SITE_URL}
        actions={
          <>
            <Button href="/setup" track="essai_hellopos" trackProps={{ emplacement: 'fonctionnalites' }}>
              Essayer {brand}
            </Button>
            <Button href="/tarifs" variant="ghost" track="voir_tarifs" trackProps={{ emplacement: 'fonctionnalites' }}>
              Voir les tarifs
            </Button>
          </>
        }
      />

      {/* Sommaire : maillage interne et repérage rapide. */}
      <section className="hp-section--tight">
        <div className="hp-container">
          <nav aria-label="Sommaire des fonctionnalités">
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.5rem',
                borderTop: '1px solid var(--line)',
                paddingTop: '1.5rem',
              }}
            >
              {FEATURE_SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="hp-chip">
                    {s.title.replace(/[.…]$/, '')}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>

      {FEATURE_SECTIONS.map((s, i) => (
        <section
          key={s.id}
          id={s.id}
          className={`hp-section${i % 2 === 1 ? ' hp-on-paper' : ''}`}
          style={{ scrollMarginTop: '5.5rem' }}
        >
          <div className={`hp-container hp-cols ${s.reverse ? 'hp-cols--sidebar-rev' : 'hp-cols--sidebar'}`}>
            {s.reverse && s.screen ? (
              <div data-reveal>
                <Screen src={s.screen.src} alt={s.screen.alt} frame="window" crop={s.screen.crop} caption={s.screen.caption} sizes="(max-width: 900px) 100vw, 640px" />
              </div>
            ) : null}

            <div data-reveal>
              <Eyebrow>{s.eyebrow}</Eyebrow>
              <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>{s.title}</h2>
              <p className="hp-lede" style={{ marginTop: '1.25rem' }}>{s.lede}</p>
              <ul style={{ listStyle: 'none', margin: '2rem 0 0', padding: 0, display: 'grid', gap: '0.7rem' }}>
                {s.points.map((p) => (
                  <li key={p} style={{ display: 'flex', gap: '0.65rem', alignItems: 'baseline' }}>
                    <span aria-hidden="true" className="hp-yes">
                      <Icon name="check" size={16} />
                    </span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>

            {!s.reverse && s.screen ? (
              <div data-reveal>
                <Screen src={s.screen.src} alt={s.screen.alt} frame="window" crop={s.screen.crop} caption={s.screen.caption} sizes="(max-width: 900px) 100vw, 640px" />
              </div>
            ) : null}
          </div>
        </section>
      ))}

      {/* Index complet */}
      <section className="hp-section hp-on-green hp-dark">
        <div className="hp-container">
          <div style={{ maxWidth: '26ch' }} data-reveal>
            <Eyebrow>Index complet</Eyebrow>
            <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>
              La liste, sans rien oublier.
            </h2>
          </div>
          <div
            style={{
              marginTop: 'clamp(2rem, 4vw, 3.5rem)',
              display: 'grid',
              gap: '2rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 15rem), 1fr))',
            }}
          >
            {FEATURE_GROUPS.map((g) => (
              <div key={g.title} data-reveal>
                <h3 className="hp-h4" style={{ color: 'var(--gold)' }}>{g.title}</h3>
                <ul style={{ listStyle: 'none', margin: '0.75rem 0 0', padding: 0, display: 'grid', gap: '0.4rem' }}>
                  {g.items.map((it) => (
                    <li key={it.label} className="hp-small">{it.label}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p style={{ marginTop: '2.5rem' }}>
            <TextLink href="/materiel">Et côté matériel ?</TextLink>
          </p>
        </div>
      </section>

      <FinalCta brand={brand} price={price} trialDays={trialDays} emplacement="fonctionnalites" />
    </>
  );
}
