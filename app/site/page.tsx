import { loadPlatform } from '@/lib/site/platform';
import { REVIEWS, REVIEW_AVG } from '@/lib/site/reviews';
import { pageMeta, SITE_URL } from '@/lib/site/meta';
import {
  Eyebrow, ButtonPrimary, ButtonGhost, BrowserFrame, FeatureCard, Icon, Stars, initials,
  GREEN, GREEN_DEEP, GOLD, BORDER, IVORY,
} from './_ui';

export const dynamic = 'force-dynamic';
export const metadata = pageMeta({
  title: 'HelloPos — Vendez vite, gérez sans effort',
  description:
    'Encaissez en quelques gestes, ne manquez plus de stock, faites revenir vos clients et pilotez votre boutique à distance. Une seule application, conforme, prête dès le premier jour.',
  path: '/',
});

const FEATURES = [
  {
    title: 'Servez vos clients plus vite',
    icon: <Icon path={<><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M3 9h18M7 21h10" /></>} />,
    desc: 'Encaissez en quelques gestes : paniers en attente, prix libres, remises, tickets numériques. La file avance, vos clients repartent contents.',
  },
  {
    title: 'Ne tombez plus en rupture',
    icon: <Icon path={<><path d="M20 7 12 3 4 7l8 4 8-4Z" /><path d="M4 7v10l8 4 8-4V7" /><path d="M12 11v10" /></>} />,
    desc: 'Stock à jour par boutique, codes-barres et étiquettes imprimées : vous savez toujours ce qu’il vous reste, sans rien compter à la main.',
  },
  {
    title: 'Faites revenir vos clients',
    icon: <Icon path={<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></>} />,
    desc: 'Fidélité, cartes dans Apple Wallet, avoirs et cartes cadeaux suivis au client : chaque visite prépare la prochaine.',
  },
  {
    title: 'Gérez les commandes sans stress',
    icon: <Icon path={<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>} />,
    desc: 'Retraits à date, livraisons et écran de préparation : les commandes à l’avance et les comptes entreprises ne vous échappent plus.',
  },
  {
    title: 'Gardez l’œil, même à distance',
    icon: <Icon path={<><path d="M3 3v18h18" /><path d="m7 14 4-4 3 3 5-6" /></>} />,
    desc: 'Chiffre d’affaires, marge et top produits en direct, sur mobile comme sur ordinateur. Votre boutique reste sous contrôle, où que vous soyez.',
  },
  {
    title: 'Restez en règle sans y penser',
    icon: <Icon path={<><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z" /><path d="m9 12 2 2 4-4" /></>} />,
    desc: 'Chaîne fiscale scellée (art. 286 CGI), rapport Z, exports comptables : la conformité est intégrée, vous n’avez rien à gérer.',
  },
];

const STEPS = [
  { n: '1', t: 'On installe tout avec vous', d: 'Catalogue, boutiques, caisses, imprimantes : vous démarrez prêt, sans y passer vos soirées.' },
  { n: '2', t: 'Votre équipe encaisse tout de suite', d: 'Connexion par code, tuiles claires, rien à apprendre. La prise en main tient en une matinée.' },
  { n: '3', t: 'Vous pilotez d’où vous voulez', d: 'Le back-office suit vos ventes, votre stock et votre caisse, depuis votre téléphone comme votre bureau.' },
];

export default async function HomePage() {
  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';

  const appLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: brand,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'iPadOS, Web',
    url: SITE_URL,
    offers: {
      '@type': 'Offer',
      price: (platform.plan_essentiel_price || '29').replace(',', '.'),
      priceCurrency: 'EUR',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: REVIEW_AVG.replace(',', '.'),
      reviewCount: REVIEWS.length,
      bestRating: '5',
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }} />
      {/* ---------------------------------------------------------------- HERO */}
      <section style={{ backgroundColor: GREEN }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-6 pt-16 pb-14 md:pt-24 md:pb-20">
          <div className="max-w-3xl">
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest"
              style={{ backgroundColor: 'rgba(255,239,179,0.15)', color: GOLD }}
            >
              Pour les commerçants indépendants
            </span>
            <h1 className="mt-5 text-4xl md:text-6xl font-bold tracking-tight text-white" style={{ textWrap: 'balance' } as React.CSSProperties}>
              Vendez vite, gérez sans effort.
            </h1>
            <p className="mt-5 text-lg md:text-xl leading-relaxed" style={{ color: 'rgba(234,230,220,0.85)' }}>
              {brand} réunit caisse, stock, fidélité et pilotage à distance dans
              une seule application. Vos ventes accélèrent, votre gestion se fait
              presque toute seule, et vous restez conforme sans y penser.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonPrimary href="/contact" onDark>Réserver une démo gratuite</ButtonPrimary>
              <ButtonGhost href="/fonctionnalites" onDark>Voir ce que ça change</ButtonGhost>
            </div>
            <p className="mt-4 text-sm" style={{ color: 'rgba(234,230,220,0.6)' }}>
              Installation accompagnée · 14 jours d’essai · sans engagement
            </p>
          </div>

          <div className="mt-12 md:mt-16">
            <BrowserFrame src="/site/screens/caisse.png" alt={`Écran de caisse ${brand}`} priority />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ FEATURES */}
      <section className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-24">
        <div className="max-w-2xl">
          <Eyebrow>Tout au même endroit</Eyebrow>
          <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">
            Tout votre commerce dans une appli.
          </h2>
          <p className="mt-3 text-base md:text-lg" style={{ color: '#5A625E' }}>
            Fini les logiciels qui ne se parlent pas. Caisse, stock, fidélité,
            commandes et compta avancent ensemble — pour vous et pour votre équipe.
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} icon={f.icon} title={f.title}>{f.desc}</FeatureCard>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------- SCREENSHOT SPLIT */}
      <section style={{ backgroundColor: '#fff', borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-24 grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <Eyebrow>Au quotidien</Eyebrow>
            <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">
              Pilotez votre journée d’un coup d’œil.
            </h2>
            <p className="mt-4 text-base md:text-lg" style={{ color: '#5A625E' }}>
              Chiffre d’affaires, panier moyen, encaissements et trésorerie : tout
              est là, en clair. Vous ouvrez, vous encaissez, vous clôturez — sans
              jamais perdre le fil.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                'Une seule ouverture de caisse, partagée par tous les postes : fini le double comptage.',
                'Vos ventes ventilées par moyen de paiement, en temps réel.',
                'Clôture guidée et rapport Z imprimé : votre journée bouclée en une minute.',
              ].map((l) => (
                <li key={l} className="flex items-start gap-2.5">
                  <span className="mt-0.5" style={{ color: GREEN }}>
                    <Icon path={<path d="m5 12 4 4L19 6" />} />
                  </span>
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          </div>
          <BrowserFrame src="/site/screens/ma-journee.png" alt="Écran Ma journée" />
        </div>
      </section>

      {/* ----------------------------------------------------------- HOW / STEPS */}
      <section className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-24">
        <div className="max-w-2xl">
          <Eyebrow>En pratique</Eyebrow>
          <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">Opérationnel dès le premier jour.</h2>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl p-6" style={{ backgroundColor: IVORY, border: `1px solid ${BORDER}` }}>
              <div className="grid h-10 w-10 place-items-center rounded-full font-bold" style={{ backgroundColor: GREEN, color: '#fff' }}>
                {s.n}
              </div>
              <h3 className="mt-4 font-semibold text-lg">{s.t}</h3>
              <p className="mt-2 text-sm" style={{ color: '#5A625E' }}>{s.d}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          <BrowserFrame src="/site/screens/caisse-paiement.png" alt="Encaissement en caisse" />
          <BrowserFrame src="/site/screens/rapports.png" alt="Rapports" />
        </div>
      </section>

      {/* -------------------------------------------------------------- PROOF */}
      <section style={{ backgroundColor: IVORY, borderTop: `1px solid ${BORDER}` }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-24">
          <div className="max-w-2xl">
            <Eyebrow>Ils l’utilisent tous les jours</Eyebrow>
            <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">
              Adopté par des commerçants comme vous.
            </h2>
            <div className="mt-4 inline-flex items-center gap-3">
              <Stars n={5} />
              <span className="text-sm font-semibold" style={{ color: GREEN }}>{REVIEW_AVG} / 5 · note moyenne</span>
            </div>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {REVIEWS.slice(0, 3).map((r) => (
              <figure key={r.name + r.shop} className="rounded-2xl bg-white p-6" style={{ border: `1px solid ${BORDER}` }}>
                <Stars n={r.stars} />
                <blockquote className="mt-4 text-[15px] leading-relaxed" style={{ color: '#14211D' }}>
                  « {r.quote} »
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold" style={{ backgroundColor: GOLD, color: GREEN_DEEP }}>
                    {initials(r.name)}
                  </span>
                  <span className="leading-tight">
                    <span className="block font-semibold text-sm" style={{ color: '#14211D' }}>{r.name}</span>
                    <span className="block text-sm" style={{ color: '#5A625E' }}>{r.shop} · {r.city}</span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
          <div className="mt-8">
            <ButtonGhost href="/avis">Lire tous les avis</ButtonGhost>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- CTA BAND */}
      <section style={{ backgroundColor: GREEN_DEEP }}>
        <div className="max-w-4xl mx-auto px-5 sm:px-6 py-16 md:py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
            Voyez ce que ça donne chez vous.
          </h2>
          <p className="mt-4 text-lg" style={{ color: 'rgba(234,230,220,0.8)' }}>
            20 minutes, sur votre propre catalogue. On vous montre l’encaissement,
            le pilotage et la conformité — vous jugez sur pièces.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <ButtonPrimary href="/contact" onDark>Réserver une démo gratuite</ButtonPrimary>
            <ButtonGhost href="/tarifs" onDark>Voir les tarifs</ButtonGhost>
          </div>
        </div>
      </section>
    </>
  );
}
