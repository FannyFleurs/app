import Link from 'next/link';
import { loadPlatform } from '@/lib/site/platform';
import { pageMeta, SITE_URL } from '@/lib/site/meta';
import { TRADES } from '@/lib/site/content/trades';
import { SEO_PATH_BY_TRADE } from '@/lib/site/routes';
import { Eyebrow, FinalCta, PageHeader, TextLink } from '../_components/ui';
import Visual from '../_components/Visual';

export const metadata = pageMeta({
  title: 'Solutions par métier — HelloPos',
  description:
    'Fleuristes, cavistes, jardineries, concept stores, épiceries : un même logiciel de caisse et de gestion, des usages différents. Découvrez HelloPos dans votre métier.',
  path: '/solutions',
});

export default async function SolutionsPage() {
  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';
  const price = platform.plan_essentiel_price || '29';
  const trialDays = platform.trial_days || 14;

  return (
    <>
      <PageHeader
        eyebrow="Solutions"
        title={<>Un même outil. Des commerces différents.</>}
        lede={`${brand} ne change pas de nature d’un métier à l’autre. Ce qui change, c’est ce dont vous vous servez tous les jours.`}
        crumbs={[
          { href: '/', label: 'Accueil' },
          { href: '/solutions', label: 'Solutions' },
        ]}
        siteUrl={SITE_URL}
      />

      <section className="hp-section--tight">
        <div className="hp-container">
          {TRADES.map((t, i) => (
            <article
              key={t.slug}
              className={`hp-cols ${i % 2 === 1 ? 'hp-cols--sidebar-rev' : 'hp-cols--sidebar'}`}
              style={{ paddingBlock: 'clamp(2.5rem, 4vw, 4.5rem)', borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}
              data-reveal
            >
              {i % 2 === 1 ? (
                <Visual slot={t.photoSlot} screen={t.screen} sizes="(max-width: 900px) 100vw, 45vw" />
              ) : null}
              <div>
                <Eyebrow>{`0${i + 1}`}</Eyebrow>
                <h2 className="hp-h2" style={{ marginTop: '1rem' }}>
                  <Link href={`/solutions/${t.slug}`} style={{ textDecoration: 'none' }}>
                    {t.claim}
                  </Link>
                </h2>
                <p className="hp-lede" style={{ marginTop: '1rem' }}>{t.lede}</p>
                <ul
                  style={{ listStyle: 'none', margin: '1.5rem 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}
                >
                  {t.chips.map((c) => (
                    <li key={c} className="hp-chip">{c}</li>
                  ))}
                </ul>
                <p style={{ marginTop: '1.75rem', display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
                  <TextLink
                    href={`/solutions/${t.slug}`}
                    track="page_metier"
                  >
                    Découvrir {brand} pour les {t.label.toLowerCase()}
                  </TextLink>
                  <TextLink href={SEO_PATH_BY_TRADE[t.slug]} arrow={false}>
                    Logiciel de caisse pour {t.singular}
                  </TextLink>
                </p>
              </div>
              {i % 2 === 0 ? (
                <Visual slot={t.photoSlot} screen={t.screen} sizes="(max-width: 900px) 100vw, 45vw" />
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="hp-section hp-on-paper">
        <div className="hp-container hp-container--text">
          <Eyebrow>Autres commerces</Eyebrow>
          <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>
            Votre métier n’est pas dans la liste ?
          </h2>
          <p className="hp-lede" style={{ marginTop: '1.25rem' }}>
            {brand} s’adresse aux commerces de détail qui vendent, préparent, gèrent du stock et
            suivent des clients. Si c’est votre cas, dites-nous comment vous travaillez : nous vous
            dirons franchement si le logiciel vous convient.
          </p>
          <p style={{ marginTop: '1.5rem' }}>
            <TextLink href="/contact">Parler de votre commerce</TextLink>
          </p>
        </div>
      </section>

      <FinalCta brand={brand} price={price} trialDays={trialDays} emplacement="solutions" />
    </>
  );
}
