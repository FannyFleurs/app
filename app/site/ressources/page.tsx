import Link from 'next/link';
import { loadPlatform } from '@/lib/site/platform';
import { pageMeta, SITE_URL } from '@/lib/site/meta';
import { RESOURCES, RESOURCE_TOPICS } from '@/lib/site/content/showcase';
import { FAQ } from '@/lib/site/content/faq';
import { Eyebrow, FinalCta, PageHeader, TextLink } from '../_components/ui';
import { Icon } from '../_components/icons';
import Faq from '../_components/Faq';

export const metadata = pageMeta({
  title: 'Ressources — HelloPos',
  description:
    'Guides, conseils, actualités, conformité, matériel et gestion de commerce : les ressources HelloPos pour tenir sa boutique et prendre en main le logiciel.',
  path: '/ressources',
});

/** Pages du site déjà utiles aujourd'hui — de vraies ressources, publiées. */
const AVAILABLE = [
  {
    href: '/conformite',
    topic: 'Conformité',
    title: 'Vos obligations de caisse, expliquées simplement',
    text: 'Inaltérabilité, sécurisation, conservation, archivage : ce que dit la règle et ce que fait le logiciel.',
  },
  {
    href: '/materiel',
    topic: 'Matériel',
    title: 'Choisir sa tablette, son imprimante, sa douchette',
    text: 'Ce qui fonctionne avec HelloPos, ce qui reste à vérifier, et ce que ça change au comptoir.',
  },
  {
    href: '/fonctionnalites',
    topic: 'Guides',
    title: 'Le logiciel, écran par écran',
    text: 'Encaissement, stocks, commandes, clients, facturation, pilotage : le tour complet.',
  },
  {
    href: '/tarifs#comparatif',
    topic: 'Gestion de commerce',
    title: 'Comparer les formules sans se tromper',
    text: 'Ce qui change d’une offre à l’autre : boutiques, caisses, préparation.',
  },
];

export default async function ResourcesPage() {
  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';
  const price = platform.plan_essentiel_price || '29';
  const trialDays = platform.trial_days || 14;

  return (
    <>
      <PageHeader
        eyebrow="Ressources"
        title={<>De quoi tenir sa boutique, et son logiciel.</>}
        lede="Des pages utiles, écrites simplement. Nous publions quand nous avons quelque chose à dire — pas pour remplir un calendrier éditorial."
        crumbs={[
          { href: '/', label: 'Accueil' },
          { href: '/ressources', label: 'Ressources' },
        ]}
        siteUrl={SITE_URL}
      />

      <section className="hp-section--tight" id="guides">
        <div className="hp-container">
          <Eyebrow>Disponible maintenant</Eyebrow>
          <ul
            style={{
              listStyle: 'none',
              margin: '2rem 0 0',
              padding: 0,
              display: 'grid',
              gap: '1rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 17rem), 1fr))',
            }}
          >
            {AVAILABLE.map((r, i) => (
              <li key={r.href} className="hp-card" data-reveal style={{ ['--reveal-delay' as string]: `${i * 60}ms` }}>
                <p className="hp-fine">{r.topic}</p>
                <h2 className="hp-h4" style={{ marginTop: '0.5rem' }}>
                  <Link href={r.href} style={{ textDecoration: 'none' }}>{r.title}</Link>
                </h2>
                <p className="hp-small" style={{ marginTop: '0.6rem' }}>{r.text}</p>
                <p style={{ marginTop: '1rem' }}>
                  <TextLink href={r.href}>Lire</TextLink>
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {RESOURCES.length > 0 ? (
        <section className="hp-section" id="actualites">
          <div className="hp-container">
            <Eyebrow>Articles</Eyebrow>
            <ul style={{ listStyle: 'none', margin: '2rem 0 0', padding: 0, display: 'grid', gap: '1.5rem' }}>
              {RESOURCES.map((r) => (
                <li key={r.slug} style={{ borderTop: '1px solid var(--line)', paddingTop: '1.5rem' }}>
                  <p className="hp-fine">
                    {r.topic} ·{' '}
                    <time dateTime={r.date}>
                      {new Date(r.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </time>
                  </p>
                  <h2 className="hp-h3" style={{ marginTop: '0.5rem' }}>
                    <Link href={`/ressources/${r.slug}`} style={{ textDecoration: 'none' }}>{r.title}</Link>
                  </h2>
                  <p className="hp-small" style={{ marginTop: '0.5rem' }}>{r.excerpt}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : (
        <section className="hp-section hp-on-paper" id="actualites">
          <div className="hp-container hp-cols hp-cols--sidebar">
            <div data-reveal>
              <Eyebrow>À paraître</Eyebrow>
              <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>
                Six sujets, et rien d’écrit d’avance.
              </h2>
              <p className="hp-lede" style={{ marginTop: '1.25rem' }}>
                Voici les thèmes que nous préparons. Chaque article paraîtra ici, daté, sans
                remplissage.
              </p>
              <p style={{ marginTop: '1.5rem' }}>
                <TextLink href="/contact">Un sujet que vous aimeriez lire ?</TextLink>
              </p>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.25rem' }}>
              {RESOURCE_TOPICS.map((t) => (
                <li
                  key={t.slug}
                  style={{ borderTop: '1px solid var(--line)', paddingBlock: '1rem', display: 'flex', gap: '0.9rem' }}
                >
                  <span aria-hidden="true" style={{ color: 'var(--ink-faint)' }}>
                    <Icon name="arrow" size={18} />
                  </span>
                  <span>
                    <b>{t.title}</b>
                    <span className="hp-small" style={{ display: 'block' }}>{t.description}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="hp-section" id="questions" style={{ scrollMarginTop: '5.5rem' }}>
        <div className="hp-container hp-cols hp-cols--sidebar">
          <div>
            <Eyebrow>Questions fréquentes</Eyebrow>
            <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>
              Les réponses courtes.
            </h2>
            <p style={{ marginTop: '1.5rem' }}>
              <TextLink href="/contact">Poser une autre question</TextLink>
            </p>
          </div>
          <Faq items={FAQ} idPrefix="faq-ressources" />
        </div>
      </section>

      <FinalCta brand={brand} price={price} trialDays={trialDays} emplacement="ressources" />
    </>
  );
}
