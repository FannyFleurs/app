import {
  Eyebrow, ButtonPrimary, BrowserFrame, FeatureCard, Icon,
  GREEN, GREEN_DEEP, GOLD, BORDER, IVORY,
} from '../_ui';

export const metadata = {
  title: 'Fonctionnalités — HelloPos',
  description:
    'Encaissez plus vite, ne manquez plus de stock, fidélisez vos clients et pilotez à distance. Voici comment HelloPos vous fait gagner du temps chaque jour.',
};

const BLOCKS = [
  {
    eyebrow: 'Le comptoir',
    title: 'Encaissez sans faire attendre',
    text:
      'Tuiles par famille, recherche, scan, prix libres et remises : chaque vente se fait en quelques gestes. Deux clients à la fois ? Mettez un panier en attente et reprenez-le en un tap.',
    points: ['Vos clients passent en caisse en quelques secondes', 'Un client pressé ? Panier en attente, reprise immédiate', 'Ticket numérique par email, sans prix si c’est un cadeau'],
    img: '/site/screens/caisse.png',
    alt: 'Écran de caisse',
  },
  {
    eyebrow: 'Pilotage',
    title: 'Gardez l’œil, où que vous soyez',
    text:
      'CA, marge, TVA, panier moyen, top produits, comparaison à l’an dernier : votre tableau de bord vous dit tout, en direct. Et le détail ticket par ticket dès que vous en avez besoin.',
    points: ['Votre chiffre d’affaires en direct, sur votre téléphone', 'Rapports ventes, TVA et avoirs prêts pour le comptable', 'Historique complet des moments sensibles'],
    img: '/site/screens/dashboard.png',
    alt: 'Tableau de bord',
    reverse: true,
  },
  {
    eyebrow: 'Argent & conformité',
    title: 'Bouclez votre caisse sans erreur',
    text:
      'Un seul fonds de caisse par boutique, réconciliation des règlements, comptage des espèces et écarts affichés. La clôture scelle la journée et imprime le rapport Z toute seule.',
    points: ['Une seule ouverture, partagée par tous les postes', 'Écarts de caisse repérés en un coup d’œil', 'Rapport Z et exports comptables en un clic'],
    img: '/site/screens/cloture.png',
    alt: 'Clôture de caisse',
  },
];

const GRID = [
  { title: 'Plusieurs boutiques, un seul pilotage', icon: <Icon path={<><path d="M3 21h18" /><path d="M5 21V8l7-5 7 5v13" /><path d="M9 21v-6h6v6" /></>} />, desc: 'Gérez toutes vos boutiques comme une seule : catalogues partagés et transferts de stock en un clic.' },
  { title: 'Des clients qui reviennent', icon: <Icon path={<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></>} />, desc: 'Récompensez vos habitués et faites-les revenir, carte de fidélité dans Apple Wallet à l’appui.' },
  { title: 'Zéro commande oubliée', icon: <Icon path={<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>} />, desc: 'Retrait à date, livraison et écran de préparation : les commandes à l’avance ne vous échappent plus.' },
  { title: 'Étiquetage en un instant', icon: <Icon path={<><path d="M20.6 13.4 12 22l-9-9V4h9l8.6 8.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.2" /></>} />, desc: 'Imprimez vos étiquettes prix, code-barres compris, sur une imprimante dédiée.' },
  { title: 'Facturez les pros sans effort', icon: <Icon path={<><path d="M6 3h9l3 3v15H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></>} />, desc: 'Factures scellées et envoyées par email, comptes clients et règlements différés suivis.' },
  { title: 'Votre back-office dans la poche', icon: <Icon path={<><rect x="2" y="4" width="20" height="14" rx="2" /><path d="M8 20h8M12 16v4" /></>} />, desc: 'Changez un prix, un réglage ou un accès depuis votre téléphone comme votre bureau.' },
];

function Split({ b }: { b: typeof BLOCKS[number] }) {
  return (
    <div className={`grid gap-10 lg:grid-cols-2 lg:items-center ${b.reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}>
      <div>
        <Eyebrow>{b.eyebrow}</Eyebrow>
        <h2 className="mt-3 text-2xl md:text-3xl font-bold tracking-tight">{b.title}</h2>
        <p className="mt-4 text-base" style={{ color: '#5A625E' }}>{b.text}</p>
        <ul className="mt-5 space-y-2.5 text-sm">
          {b.points.map((p) => (
            <li key={p} className="flex items-start gap-2.5">
              <span className="mt-0.5" style={{ color: GREEN }}><Icon path={<path d="m5 12 4 4L19 6" />} /></span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
      <BrowserFrame src={b.img} alt={b.alt} />
    </div>
  );
}

export default function FeaturesPage() {
  return (
    <>
      <section style={{ backgroundColor: GREEN }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-20">
          <Eyebrow onDark>Fonctionnalités</Eyebrow>
          <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight text-white max-w-3xl">
            Tout votre métier, dans une appli.
          </h1>
          <p className="mt-4 text-lg max-w-2xl" style={{ color: 'rgba(234,230,220,0.85)' }}>
            De l’encaissement au pilotage, en passant par la fidélité et la
            conformité : voici comment HelloPos vous fait gagner du temps chaque jour.
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-24 space-y-20 md:space-y-28">
        {BLOCKS.map((b) => <Split key={b.title} b={b} />)}
      </section>

      <section style={{ backgroundColor: IVORY, borderTop: `1px solid ${BORDER}` }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-24">
          <div className="max-w-2xl">
            <Eyebrow>Et aussi</Eyebrow>
            <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">Tout le reste, inclus.</h2>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {GRID.map((g) => <FeatureCard key={g.title} icon={g.icon} title={g.title}>{g.desc}</FeatureCard>)}
          </div>
        </div>
      </section>

      <section style={{ backgroundColor: GREEN_DEEP }}>
        <div className="max-w-4xl mx-auto px-5 sm:px-6 py-16 text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white">Voyez-la en action.</h2>
          <p className="mt-4 text-lg" style={{ color: 'rgba(234,230,220,0.8)' }}>
            On vous montre HelloPos sur votre propre catalogue, en 20 minutes.
          </p>
          <div className="mt-8 flex justify-center" style={{ color: GOLD }}>
            <ButtonPrimary href="/contact" onDark>Réserver une démo gratuite</ButtonPrimary>
          </div>
        </div>
      </section>
    </>
  );
}
