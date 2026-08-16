import { loadPlatform } from '@/lib/site/platform';
import { pageMeta, SITE_URL } from '@/lib/site/meta';
import { Eyebrow, FinalCta, PageHeader, TextLink } from '../_components/ui';
import Screen from '../_components/Screen';
import Visual from '../_components/Visual';

export const metadata = pageMeta({
  title: 'À propos — HelloPos',
  description:
    'Pourquoi HelloPos existe, le problème que le logiciel cherche à résoudre, et la façon dont il est conçu pour le commerce indépendant.',
  path: '/a-propos',
});

export default async function AboutPage() {
  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';
  const price = platform.plan_essentiel_price || '29';
  const trialDays = platform.trial_days || 14;

  const hasEditorInfo = Boolean(
    platform.company_legal_name || platform.company_siret || platform.address_city || platform.contact_email,
  );

  return (
    <>
      <PageHeader
        eyebrow="À propos"
        title={<>Un logiciel écrit à hauteur de comptoir.</>}
        lede={`${brand} n’essaie pas de ressembler à un progiciel. Il essaie de ressembler à une journée de commerce.`}
        crumbs={[
          { href: '/', label: 'Accueil' },
          { href: '/a-propos', label: 'À propos' },
        ]}
        siteUrl={SITE_URL}
      />

      <section className="hp-section--tight">
        <div className="hp-container hp-cols hp-cols--sidebar-rev" style={{ marginTop: '2rem' }}>
          <div data-reveal>
            <Visual
              slot="a-propos"
              screen={{
                src: '/site/screens/caisse.png',
                alt: 'Écran de caisse HelloPos',
              }}
              sizes="(max-width: 900px) 100vw, 55vw"
              priority
            />
          </div>
          <div className="hp-prose" data-reveal>
            <p>
              Un commerçant qui vend, prépare, commande, range, facture et clôture n’a pas besoin de
              six outils. Il a besoin d’un seul endroit où tout se retrouve — et d’une caisse qui ne
              s’arrête pas au ticket.
            </p>
            <p>
              C’est le point de départ de {brand} : rassembler l’encaissement et la gestion dans une
              même application, à un prix qu’un commerce indépendant peut assumer.
            </p>
          </div>
        </div>
      </section>

      <section className="hp-section">
        <div className="hp-container hp-cols hp-cols--sidebar">
          <div data-reveal>
            <Eyebrow>Le problème</Eyebrow>
            <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>
              La caisse enregistre.
              <br />
              Le reste attend sur un carnet.
            </h2>
          </div>
          <div className="hp-prose" data-reveal>
            <p>
              Beaucoup de commerces travaillent avec une caisse qui sait faire des tickets, un
              tableur pour les stocks, un carnet pour les commandes, une pile de bons de livraison
              et un dossier de factures à retaper en fin de mois. Chacun de ces outils fonctionne.
              Ensemble, ils fuient.
            </p>
            <p>
              Ce qui se perd n’est pas spectaculaire : une commande notée sur un post-it, un avoir
              oublié, un article qu’on croyait en stock, une facture à refaire. Mis bout à bout,
              c’est du temps, de la marge, et de la charge mentale.
            </p>
            <p>
              {brand} traite ces sujets au même endroit que l’encaissement, parce que c’est là
              qu’ils naissent.
            </p>
          </div>
        </div>
      </section>

      <section className="hp-section hp-on-green hp-dark">
        <div className="hp-container">
          <div style={{ maxWidth: '26ch' }} data-reveal>
            <Eyebrow>Notre façon de faire</Eyebrow>
            <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>
              Quatre partis pris.
            </h2>
          </div>
          <ol
            style={{
              listStyle: 'none',
              margin: 'clamp(2rem, 4vw, 3.5rem) 0 0',
              padding: 0,
              display: 'grid',
              gap: '1.5rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 16rem), 1fr))',
            }}
          >
            {[
              [
                'L’écran de caisse d’abord',
                'C’est l’écran le plus regardé de la boutique. Il doit être compris en une matinée par une personne qui débute.',
              ],
              [
                'Tout est lié',
                'Une vente touche le stock, le client, la TVA et vos chiffres. Séparer ces sujets, c’est créer du travail en double.',
              ],
              [
                'Un prix lisible',
                'Une offre d’entrée complète, pas une version amputée. Les différences entre formules portent sur le périmètre, pas sur des fonctions retirées.',
              ],
              [
                'Ne rien promettre d’inexistant',
                'Ce site ne publie ni témoignage inventé, ni compatibilité supposée, ni certification que nous n’avons pas.',
              ],
            ].map(([title, text], i) => (
              <li key={title} data-reveal style={{ ['--reveal-delay' as string]: `${i * 70}ms` }}>
                <p className="hp-num" style={{ color: 'var(--gold)', fontSize: '1.5rem' }}>
                  {`0${i + 1}`}
                </p>
                <h3 className="hp-h4" style={{ marginTop: '0.75rem' }}>{title}</h3>
                <p className="hp-small" style={{ marginTop: '0.5rem' }}>{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="hp-section hp-on-paper">
        <div className="hp-container hp-cols hp-cols--sidebar-rev">
          <div data-reveal>
            <Screen
              src="/site/screens/ma-journee.png"
              alt={`Écran « Ma journée » de ${brand}`}
              frame="window"
              caption="Capture réalisée sur un environnement de démonstration."
              sizes="(max-width: 900px) 100vw, 620px"
            />
          </div>
          <div data-reveal>
            <Eyebrow>Le commerce indépendant</Eyebrow>
            <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>
              Pensé avec des boutiques,
              <br />
              pas pour une catégorie.
            </h2>
            <div className="hp-prose" style={{ marginTop: '1.25rem' }}>
              <p>
                Le produit s’est construit au contact de commerces qui préparent autant qu’ils
                vendent — fleuristes, commerces végétaux, boutiques de détail. Cela se voit dans
                le logiciel : les articles à prix libre, les commandes avec date de retrait,
                l’écran d’atelier, les taux de TVA proposés à la configuration.
              </p>
              <p>
                Ces choix profitent aujourd’hui à d’autres métiers : caves, jardineries, concept
                stores, épiceries. Le socle est le même, les usages diffèrent.
              </p>
            </div>
            <p style={{ marginTop: '1.5rem' }}>
              <TextLink href="/solutions">Voir les métiers</TextLink>
            </p>
          </div>
        </div>
      </section>

      <section className="hp-section">
        <div className="hp-container hp-container--text">
          <Eyebrow>L’éditeur</Eyebrow>
          <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>Qui édite {brand}.</h2>
          <div className="hp-prose" style={{ marginTop: '1.25rem' }}>
            {hasEditorInfo ? (
              <>
                <p>
                  {brand} est édité par {platform.company_legal_name || 'la société éditrice'}
                  {platform.address_city ? `, à ${platform.address_city}` : ''}.
                </p>
                <p>
                  Les mentions légales détaillent l’identité de l’éditeur, l’hébergement et les
                  conditions d’utilisation du site.
                </p>
              </>
            ) : (
              <p>
                Les informations de l’éditeur — raison sociale, siège, immatriculation — sont
                publiées sur la page Mentions légales, à partir des données renseignées par
                l’éditeur. Nous n’affichons ici aucune information tant qu’elle n’est pas
                renseignée.
              </p>
            )}
          </div>
          <p style={{ marginTop: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
            <TextLink href="/mentions-legales">Mentions légales</TextLink>
            <TextLink href="/contact">Nous écrire</TextLink>
          </p>
        </div>
      </section>

      <FinalCta brand={brand} price={price} trialDays={trialDays} emplacement="a-propos" />
    </>
  );
}
