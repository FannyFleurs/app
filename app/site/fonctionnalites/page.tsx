import {
  Eyebrow, ButtonPrimary, BrowserFrame, FeatureCard, Icon,
  GREEN, GREEN_DEEP, GOLD, BORDER, IVORY,
} from '../_ui';

export const metadata = {
  title: 'Fonctionnalités — HelloPos',
  description:
    'Caisse iPad, catalogue et stock, clients et fidélité, commande différée, pilotage à distance et conformité fiscale. Le détail de ce que fait HelloPos.',
};

const BLOCKS = [
  {
    eyebrow: 'Le comptoir',
    title: 'Une caisse iPad taillée pour le rythme de la boutique',
    text:
      'Tuiles par famille, recherche et scan, prix libres, remises ligne ou ticket, paniers en attente pour servir deux clients à la fois. Le rendu monnaie, les tickets numériques et l’impression sont intégrés.',
    points: ['Encaissement en quelques gestes', 'Paniers en attente & reprise', 'Tickets numériques, sans prix, par email'],
    img: '/site/screens/ma-journee.png',
    alt: 'Écran caisse Ma journée',
  },
  {
    eyebrow: 'Pilotage',
    title: 'Votre chiffre d’affaires en direct, où que vous soyez',
    text:
      'Le tableau de bord suit le CA, la marge, la TVA collectée, le panier moyen et les top produits, avec comparaison à l’an dernier. Les rapports et historiques donnent le détail, ticket par ticket.',
    points: ['Tableau de bord temps réel', 'Rapports ventes, TVA, avoirs', 'Historiques des points sensibles'],
    img: '/site/screens/dashboard.png',
    alt: 'Tableau de bord',
    reverse: true,
  },
  {
    eyebrow: 'Argent & conformité',
    title: 'Une clôture guidée, une caisse toujours juste',
    text:
      'Un seul fonds de caisse par boutique par défaut, réconciliation des règlements, comptage des espèces et écarts affichés. La clôture scelle la journée et imprime le rapport Z sur l’imprimante ticket.',
    points: ['Fond de caisse par boutique (ou par poste)', 'Réconciliation par moyen de paiement', 'Rapport Z & exports comptables'],
    img: '/site/screens/cloture.png',
    alt: 'Clôture de caisse',
  },
];

const GRID = [
  { title: 'Multi-boutiques', icon: <Icon path={<><path d="M3 21h18" /><path d="M5 21V8l7-5 7 5v13" /><path d="M9 21v-6h6v6" /></>} />, desc: 'Plusieurs boutiques et leurs caisses, catalogues partagés ou distincts, transferts de stock.' },
  { title: 'Fidélité & Wallet', icon: <Icon path={<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></>} />, desc: 'Points, cartes Apple Wallet dématérialisées, avoirs et cartes cadeaux suivis au client.' },
  { title: 'Commande différée', icon: <Icon path={<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>} />, desc: 'Retrait à date et livraison, écran atelier mural pour préparer les commandes.' },
  { title: 'Étiquettes', icon: <Icon path={<><path d="M20.6 13.4 12 22l-9-9V4h9l8.6 8.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.2" /></>} />, desc: 'Impression d’étiquettes prix code-barres sur imprimante dédiée.' },
  { title: 'Facturation B2B', icon: <Icon path={<><path d="M6 3h9l3 3v15H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></>} />, desc: 'Factures numérotées, scellées, envoyées par email. Comptes clients et règlements différés.' },
  { title: 'Back-office distant', icon: <Icon path={<><rect x="2" y="4" width="20" height="14" rx="2" /><path d="M8 20h8M12 16v4" /></>} />, desc: 'Catalogue, stock, prix, utilisateurs et réglages, depuis mobile ou ordinateur.' },
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
            Une application, tout le métier de fleuriste.
          </h1>
          <p className="mt-4 text-lg max-w-2xl" style={{ color: 'rgba(234,230,220,0.85)' }}>
            De l’encaissement au pilotage, en passant par la fidélité et la
            conformité : voici ce que vous manipulez chaque jour.
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
            On vous fait une démonstration sur votre propre catalogue.
          </p>
          <div className="mt-8 flex justify-center" style={{ color: GOLD }}>
            <ButtonPrimary href="/contact" onDark>Demander une démo</ButtonPrimary>
          </div>
        </div>
      </section>
    </>
  );
}
