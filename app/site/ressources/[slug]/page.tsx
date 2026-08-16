import { notFound } from 'next/navigation';
import { loadPlatform } from '@/lib/site/platform';
import { pageMeta, SITE_URL } from '@/lib/site/meta';
import { RESOURCES, resourceBySlug } from '@/lib/site/content/showcase';
import { FinalCta, PageHeader, TextLink } from '../../_components/ui';

/**
 * Article de la rubrique Ressources.
 *
 * La route existe et fonctionne ; elle ne répond que pour les articles
 * réellement publiés dans lib/site/content/showcase.ts.
 */
export function generateStaticParams() {
  return RESOURCES.map((r) => ({ slug: r.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const article = resourceBySlug(params.slug);
  if (!article) {
    return pageMeta({ title: 'Ressources — HelloPos', description: '', path: '/ressources', noIndex: true });
  }
  return pageMeta({
    title: `${article.title} — HelloPos`,
    description: article.excerpt,
    path: `/ressources/${article.slug}`,
  });
}

export default async function ResourcePage({ params }: { params: { slug: string } }) {
  const article = resourceBySlug(params.slug);
  if (!article) notFound();

  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';
  const price = platform.plan_essentiel_price || '29';
  const trialDays = platform.trial_days || 14;

  return (
    <>
      <PageHeader
        eyebrow={article.topic}
        title={article.title}
        lede={article.excerpt}
        crumbs={[
          { href: '/', label: 'Accueil' },
          { href: '/ressources', label: 'Ressources' },
          { href: `/ressources/${article.slug}`, label: article.title },
        ]}
        siteUrl={SITE_URL}
      />

      <article className="hp-section--tight">
        <div className="hp-container hp-container--text hp-prose">
          <p className="hp-fine">
            <time dateTime={article.date}>
              {new Date(article.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </time>
          </p>
          {article.body.map((block, i) => (
            <section key={block.h2 ?? i} style={{ marginTop: '2rem' }}>
              {block.h2 ? <h2 className="hp-h3" style={{ marginBottom: '1rem' }}>{block.h2}</h2> : null}
              {block.p.map((p) => (
                <p key={p.slice(0, 40)}>{p}</p>
              ))}
            </section>
          ))}
          <p style={{ marginTop: '2.5rem' }}>
            <TextLink href="/ressources">Revenir aux ressources</TextLink>
          </p>
        </div>
      </article>

      <FinalCta brand={brand} price={price} trialDays={trialDays} emplacement={`ressource-${article.slug}`} />
    </>
  );
}
