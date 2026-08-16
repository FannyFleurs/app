import Link from 'next/link';
import { loadPlatform } from '@/lib/site/platform';
import { pageMeta } from '@/lib/site/meta';
import { FEATURE_GROUPS } from '@/lib/site/content/features';
import { DAY_MOMENTS, ONBOARDING, COMPLIANCE_POINTS } from '@/lib/site/content/home';
import { FAQ } from '@/lib/site/content/faq';
import { TESTIMONIALS } from '@/lib/site/content/showcase';
import { Button, Eyebrow, Reassurance, TextLink } from './_components/ui';
import { Icon } from './_components/icons';
import Screen from './_components/Screen';
import Photo from './_components/Photo';
import Visual from './_components/Visual';
import LinkedWeb from './_components/LinkedWeb';
import ProductStory from './_components/ProductStory';
import TradeSwitcher from './_components/TradeSwitcher';
import DemoVideo from './_components/DemoVideo';
import Faq from './_components/Faq';

export const metadata = pageMeta({
  title: 'HelloPos — La caisse qui fait beaucoup plus que la caisse',
  description:
    'HelloPos réunit caisse, stocks, commandes, clients et pilotage dans une seule application pensée pour les commerçants. Dès 29 € HT/mois, 14 jours d’essai, sans engagement.',
  path: '/',
});

export default async function HomePage() {
  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';
  const price = platform.plan_essentiel_price || '29';
  const trialDays = platform.trial_days || 14;
  const demoUrl = platform.demo_video_url || '';
  const demoHref = demoUrl ? '#demo' : '/contact#demo';

  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* 02 — Hero                                                        */}
      {/* ---------------------------------------------------------------- */}
      <section className="hp-hero">
        <div className="hp-container hp-hero-grid">
          <div>
            <Eyebrow>{brand}</Eyebrow>
            <h1 className="hp-display" style={{ marginTop: '1.25rem' }}>
              La caisse qui
              <br />
              fait <span className="hp-em">beaucoup plus</span>
              <br />
              que la caisse.
            </h1>
            <p className="hp-h4" style={{ marginTop: '1.75rem' }}>
              Encaissez. Gérez. Pilotez. Grandissez.
            </p>
            <p className="hp-lede" style={{ marginTop: '0.75rem' }}>
              {brand} réunit caisse, stocks, commandes, clients et pilotage dans une seule
              application pensée pour les commerçants.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem', marginTop: '2rem' }}>
              <Button href="/setup" size="lg" track="essai_hellopos" trackProps={{ emplacement: 'hero' }}>
                Essayer {brand}
              </Button>
              <Button href={demoHref} variant="ghost" size="lg" track="voir_demo" trackProps={{ emplacement: 'hero' }}>
                Voir la démo
              </Button>
            </div>
            <Reassurance
              className="mt-6"
              items={[`Dès ${price} € HT/mois`, `${trialDays} jours gratuits`, 'Sans engagement']}
            />
          </div>

          <div className="hp-hero-media">
            <span className="hp-hero-rule" aria-hidden="true" />
            <div className="hp-hero-back">
              <Screen
                src="/site/screens/dashboard.png"
                alt=""
                frame="window"
                sizes="(max-width: 1000px) 60vw, 480px"
              />
            </div>
            <div className="hp-hero-front">
              <Screen
                src="/site/screens/caisse.png"
                alt={`Écran de caisse ${brand} : familles d’articles, recherche et panier en cours`}
                frame="tablet"
                priority
                sizes="(max-width: 1000px) 92vw, 700px"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 03 — Tout est lié                                                */}
      {/* ---------------------------------------------------------------- */}
      <section className="hp-section hp-on-green hp-dark">
        <div className="hp-container">
          <div data-reveal>
            <Eyebrow>Tout est lié</Eyebrow>
            <h2 className="hp-h1" style={{ marginTop: '1.25rem' }}>
              Votre commerce
              <br />
              ne s’arrête pas
              <br />
              au ticket de caisse.
            </h2>
          </div>

          <LinkedWeb />

          <div className="hp-cols hp-cols--sidebar-rev" style={{ marginTop: 'clamp(3rem, 5vw, 5rem)' }}>
            <div data-reveal>
              <Screen
                src="/site/screens/dashboard.png"
                alt={`Tableau de bord ${brand} : chiffre d’affaires, ticket moyen, marge et TVA collectée`}
                frame="window"
                caption="Capture réalisée sur un environnement de démonstration."
                sizes="(max-width: 900px) 100vw, 700px"
              />
            </div>
            <div data-reveal>
              <p className="hp-lede">
                Chaque vente touche le stock, la fiche client, la TVA et vos chiffres du jour.
                {' '}
                {brand} enregistre tout au même endroit — et vous le rend lisible.
              </p>
              <p style={{ marginTop: '1.5rem' }}>
                <TextLink href="/fonctionnalites">Voir tout ce que fait {brand}</TextLink>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 04 — HelloPos en action                                          */}
      {/* ---------------------------------------------------------------- */}
      <section className="hp-section hp-on-paper" id="en-action">
        <div className="hp-container">
          <div style={{ maxWidth: '30ch' }} data-reveal>
            <Eyebrow>{brand} en action</Eyebrow>
            <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>
              Le logiciel, écran par écran.
            </h2>
          </div>
          <div style={{ marginTop: 'clamp(2rem, 4vw, 4rem)' }}>
            <ProductStory />
          </div>

          {demoUrl ? (
            <div id="demo" style={{ marginTop: 'clamp(3rem, 5vw, 5rem)', maxWidth: '900px', marginInline: 'auto' }}>
              <DemoVideo url={demoUrl} poster="/site/screens/caisse.png" />
            </div>
          ) : null}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 05 — Index fonctionnel                                           */}
      {/* ---------------------------------------------------------------- */}
      <section className="hp-section" id="fonctions">
        <div className="hp-container">
          <div className="hp-cols hp-cols--2" style={{ alignItems: 'end' }}>
            <div data-reveal>
              <Eyebrow>Index</Eyebrow>
              <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>
                Tout ce qu’il faut.
                <br />
                Là où il faut.
              </h2>
            </div>
            <p className="hp-lede" data-reveal>
              Six moments dans la journée d’un commerce. {brand} les couvre tous, sans logiciel
              supplémentaire.
            </p>
          </div>

          <div className="hp-index" style={{ marginTop: 'clamp(2.5rem, 4vw, 4rem)' }}>
            {FEATURE_GROUPS.map((g) => (
              <div key={g.title} className="hp-index-group" data-reveal>
                <div>
                  <div className="hp-index-title">
                    <span aria-hidden="true" style={{ color: 'var(--green)' }}>
                      <Icon name={g.icon} size={20} />
                    </span>
                    <h3 className="hp-h3">{g.title}</h3>
                  </div>
                  <p className="hp-small" style={{ marginTop: '0.35rem' }}>{g.intro}</p>
                </div>
                <ul className="hp-index-items">
                  {g.items.map((item) => (
                    <li key={item.label} className="hp-index-item">
                      <span aria-hidden="true" style={{ color: 'var(--ink-faint)' }}>
                        <Icon name={item.icon} size={16} />
                      </span>
                      <span>
                        <b>{item.label}</b>
                        {item.hint ? <span> {item.hint}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p style={{ marginTop: '2rem' }}>
            <TextLink href="/fonctionnalites">Le détail, écran par écran</TextLink>
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 06 — Dès 29 €                                                    */}
      {/* ---------------------------------------------------------------- */}
      <section className="hp-section hp-on-gold" id="prix">
        <div className="hp-container">
          <div className="hp-cols hp-cols--sidebar" style={{ alignItems: 'center' }}>
            <div>
              <p className="hp-price-figure" data-reveal>
                <span className="hp-price-amount">{price} €</span>
                <span className="hp-price-unit">
                  HT
                  <br />
                  / mois
                </span>
              </p>
            </div>
            <div data-reveal>
              <h2 className="hp-h2">Oui, vraiment.</h2>
              <p className="hp-lede" style={{ marginTop: '1rem', color: 'var(--green-deep)', opacity: 0.8 }}>
                L’offre d’entrée n’est pas une version réduite : c’est {brand}, pour une boutique
                et une caisse.
              </p>
              <ul
                style={{
                  listStyle: 'none',
                  margin: '2rem 0 0',
                  padding: 0,
                  display: 'grid',
                  gap: '0.6rem',
                  maxWidth: '34rem',
                }}
              >
                {[
                  'Encaissement, tickets, avoirs et cartes cadeaux',
                  'Catalogue, stocks, inventaires et étiquettes',
                  'Commandes avec date de retrait et acompte',
                  'Clients, fidélité et carte dans Apple Wallet',
                  'Rapports, clôtures, rapport Z et exports comptables',
                  'Utilisateurs, rôles et permissions',
                ].map((line) => (
                  <li key={line} style={{ display: 'flex', gap: '0.65rem', alignItems: 'baseline' }}>
                    <span aria-hidden="true" style={{ color: 'var(--green)' }}>
                      <Icon name="check" size={16} />
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: '2rem' }}>
                <Button href="/tarifs" track="voir_tarifs" trackProps={{ emplacement: 'accueil' }} arrow>
                  Découvrir les formules
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 07 — Une journée avec HelloPos                                   */}
      {/* ---------------------------------------------------------------- */}
      <section className="hp-section hp-on-green-deep hp-dark">
        <div className="hp-container">
          <div data-reveal>
            <Eyebrow>Une journée</Eyebrow>
            <h2 className="hp-h1" style={{ marginTop: '1.25rem' }}>
              Conçu pour les gens
              <br />
              qui ouvrent leur boutique
              <br />
              le matin.
            </h2>
          </div>

          <div className="hp-day">
            {DAY_MOMENTS.map((m, i) => (
              <div key={m.time} className="hp-day-item" data-reveal style={{ ['--reveal-delay' as string]: `${i * 90}ms` }}>
                <p className="hp-num" style={{ fontSize: '1.6rem', color: 'var(--gold)' }}>{m.time}</p>
                <h3 className="hp-h4" style={{ marginTop: '0.5rem' }}>{m.title}</h3>
                <p className="hp-small" style={{ marginTop: '0.4rem' }}>{m.text}</p>
              </div>
            ))}
          </div>

          <div
            style={{ marginTop: 'clamp(2.5rem, 4vw, 4rem)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1.5rem' }}
            data-reveal
          >
            <p className="hp-h3" style={{ color: 'var(--gold)' }}>{brand} était là toute la journée.</p>
            <TextLink href="/fonctionnalites">Voir les fonctionnalités</TextLink>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 08 — Un même outil. Des commerces différents.                    */}
      {/* ---------------------------------------------------------------- */}
      <section className="hp-section" id="metiers">
        <div className="hp-container">
          <div data-reveal>
            <Eyebrow>Métiers</Eyebrow>
            <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>
              Un même outil.
              <br />
              Des commerces différents.
            </h2>
          </div>
          <div style={{ marginTop: 'clamp(2rem, 4vw, 3rem)' }}>
            <TradeSwitcher />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 09 — Ils utilisent HelloPos au quotidien                         */}
      {/* ---------------------------------------------------------------- */}
      <section className="hp-section hp-on-warm" id="temoignages">
        <div className="hp-container">
          {TESTIMONIALS.length > 0 ? (
            <div className="hp-cols hp-cols--sidebar-rev">
              <div data-reveal>
                <Photo slot={TESTIMONIALS[0]?.photoSlot ?? 'temoignage-1'} ratio="landscape" />
              </div>
              <div data-reveal>
                <Eyebrow>Témoignage</Eyebrow>
                <blockquote className="hp-h3" style={{ marginTop: '1.25rem' }}>
                  « {TESTIMONIALS[0]?.quote} »
                </blockquote>
                <p className="hp-small" style={{ marginTop: '1.5rem' }}>
                  <b>{TESTIMONIALS[0]?.shop}</b>
                  <br />
                  {TESTIMONIALS[0]?.city} · {TESTIMONIALS[0]?.activity}
                  {TESTIMONIALS[0]?.person ? (
                    <>
                      <br />
                      {TESTIMONIALS[0]?.person?.name} — {TESTIMONIALS[0]?.person?.role}
                    </>
                  ) : null}
                </p>
                <p style={{ marginTop: '1.5rem' }}>
                  <TextLink href="/clients" track="cas_client">Découvrir leur expérience</TextLink>
                </p>
              </div>
            </div>
          ) : (
            <div className="hp-cols hp-cols--sidebar-rev">
              <div data-reveal>
                <Visual
                  slot="temoignage-1"
                  screen={{
                    src: '/site/screens/ma-journee.png',
                    alt: 'Écran « Ma journée » de HelloPos',
                    caption: 'Capture réalisée sur un environnement de démonstration.',
                  }}
                  sizes="(max-width: 900px) 100vw, 600px"
                />
              </div>
              <div data-reveal>
                <Eyebrow>Ils utilisent {brand} au quotidien</Eyebrow>
                <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>
                  Les témoignages arrivent
                  <br />
                  de la boutique, pas d’ici.
                </h2>
                <p className="hp-lede" style={{ marginTop: '1rem' }}>
                  Nous ne publions que des témoignages recueillis auprès de commerces qui utilisent
                  réellement {brand}, avec leur accord. Cette page se remplira avec eux.
                </p>
                <p style={{ marginTop: '1.5rem' }}>
                  <TextLink href="/contact">Vous utilisez {brand} ? Racontez-nous</TextLink>
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 10 — Accompagnement                                              */}
      {/* ---------------------------------------------------------------- */}
      <section className="hp-section hp-on-paper" id="accompagnement">
        <div className="hp-container">
          <div className="hp-cols hp-cols--2" style={{ alignItems: 'end' }}>
            <div data-reveal>
              <Eyebrow>Accompagnement</Eyebrow>
              <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>
                Vous n’installez pas
                <br />
                votre caisse tout seul.
              </h2>
            </div>
            <p className="hp-lede" data-reveal>
              Une caisse qui démarre mal se paie pendant des mois. On préfère commencer par
              comprendre votre commerce.
            </p>
          </div>

          <ol
            style={{
              listStyle: 'none',
              margin: 'clamp(2.5rem, 4vw, 4rem) 0 0',
              padding: 0,
              display: 'grid',
              gap: '1px',
              background: 'var(--line)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--r-lg)',
              overflow: 'hidden',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 15rem), 1fr))',
            }}
          >
            {ONBOARDING.map((s) => (
              <li key={s.index} style={{ background: 'var(--paper)', padding: 'clamp(1.25rem, 2vw, 2rem)' }}>
                <p className="hp-story-index">{s.index}</p>
                <h3 className="hp-h4" style={{ marginTop: '0.75rem' }}>{s.title}</h3>
                <p className="hp-small" style={{ marginTop: '0.5rem' }}>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 11 — Conformité                                                  */}
      {/* ---------------------------------------------------------------- */}
      <section className="hp-section" id="conformite">
        <div className="hp-container hp-cols hp-cols--sidebar">
          <div data-reveal>
            <Eyebrow>Conformité</Eyebrow>
            <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>
              Une caisse pensée aussi
              <br />
              pour les obligations
              <br />
              qui vont avec.
            </h2>
            <p className="hp-lede" style={{ marginTop: '1.25rem' }}>
              L’inaltérabilité, la sécurisation, la conservation et l’archivage des données de
              caisse sont intégrés au produit. Vous n’avez rien à cocher.
            </p>
            <p style={{ marginTop: '1.5rem' }}>
              <TextLink href="/conformite">Comprendre la conformité {brand}</TextLink>
            </p>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '1rem' }}>
            {COMPLIANCE_POINTS.map((p, i) => (
              <li
                key={p.title}
                className="hp-card"
                data-reveal
                style={{ ['--reveal-delay' as string]: `${i * 70}ms`, display: 'flex', gap: '1rem' }}
              >
                <span aria-hidden="true" style={{ color: 'var(--green)', flex: '0 0 auto' }}>
                  <Icon name="shield" size={22} />
                </span>
                <span>
                  <b className="hp-h4">{p.title}</b>
                  <span className="hp-small" style={{ display: 'block', marginTop: '0.35rem' }}>{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 12 — FAQ                                                         */}
      {/* ---------------------------------------------------------------- */}
      <section className="hp-section hp-on-paper" id="faq">
        <div className="hp-container hp-cols hp-cols--sidebar">
          <div data-reveal>
            <Eyebrow>Questions</Eyebrow>
            <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>
              Ce qu’on nous demande
              <br />
              le plus souvent.
            </h2>
            <p className="hp-lede" style={{ marginTop: '1.25rem' }}>
              Une question qui n’est pas là ? Écrivez-nous, la réponse arrive d’une personne.
            </p>
            <p style={{ marginTop: '1.5rem' }}>
              <TextLink href="/contact">Poser votre question</TextLink>
            </p>
          </div>
          <div>
            <Faq items={FAQ} withSchema />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 13 — CTA final                                                   */}
      {/* ---------------------------------------------------------------- */}
      <section className="hp-section hp-on-green hp-dark">
        <div className="hp-container" style={{ textAlign: 'center' }}>
          <h2 className="hp-display" data-reveal>
            Votre commerce.
            <br />
            Une seule application.
          </h2>
          <p className="hp-lede" style={{ marginTop: '1.5rem', marginInline: 'auto', maxWidth: '32ch' }} data-reveal>
            Essayez {brand} pendant {trialDays} jours.
          </p>
          <div
            style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.9rem', marginTop: '2.5rem' }}
            data-reveal
          >
            <Button href="/setup" variant="gold" size="lg" track="essai_hellopos" trackProps={{ emplacement: 'cta-final' }}>
              Commencer gratuitement
            </Button>
            <Button href="/contact#demo" variant="ghost" size="lg" track="reserver_demo" trackProps={{ emplacement: 'cta-final' }}>
              Réserver une démo
            </Button>
          </div>
          <Reassurance
            className="mt-6"
            items={[`Dès ${price} € HT/mois`, 'Sans engagement']}
          />
          <p className="hp-fine" style={{ marginTop: '2.5rem' }}>
            Déjà client ? <Link className="hp-link" href="/connexion">Se connecter</Link>
          </p>
        </div>
      </section>
    </>
  );
}
