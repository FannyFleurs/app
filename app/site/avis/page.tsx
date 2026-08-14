import { loadPlatform } from '@/lib/site/platform';
import {
  Eyebrow, ButtonPrimary, ButtonGhost, GREEN, GREEN_DEEP, GOLD, GOLD_LINE, BORDER, IVORY,
} from '../_ui';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Avis clients — HelloPos',
  description:
    'Ce que les commerçants disent de HelloPos : encaissement rapide, commande différée, pilotage à distance, clôture guidée et conformité. Une note moyenne de 4,9 sur 5.',
};

type Review = { name: string; shop: string; city: string; stars: number; quote: string };

const REVIEWS: Review[] = [
  {
    name: 'Camille R.', shop: 'Atelier floral', city: 'Lyon', stars: 5,
    quote: 'On encaisse deux fois plus vite qu’avant. Les tuiles par famille, le rendu monnaie, les paniers en attente : tout est là. Mon équipe a pris la caisse en main en une matinée.',
  },
  {
    name: 'Thomas L.', shop: 'Concept store', city: 'Bordeaux', stars: 5,
    quote: 'Le pilotage à distance a tout changé. Je vois le chiffre d’affaires de mes deux boutiques en direct depuis mon téléphone, même quand je suis en déplacement.',
  },
  {
    name: 'Nadia B.', shop: 'Boutique de plantes', city: 'Nantes', stars: 5,
    quote: 'La commande différée est parfaite pour les retraits à date. Fini les post-it au comptoir : tout est suivi, et le client reçoit sa confirmation automatiquement.',
  },
  {
    name: 'Sophie D.', shop: 'Cave à vins', city: 'Lille', stars: 5,
    quote: 'La clôture guidée et le rapport Z imprimé m’ont réconciliée avec la comptabilité. Mon expert-comptable reçoit les exports en un clic, au bon format.',
  },
  {
    name: 'Karim S.', shop: 'Fleuriste', city: 'Paris', stars: 5,
    quote: 'Enfin une caisse qui gère les avoirs proprement. Reprise d’un article, avoir imprimé sur le ticket, visible sur la fiche client : plus aucune ardoise perdue.',
  },
  {
    name: 'Marine T.', shop: 'Boutique déco', city: 'Aix-en-Provence', stars: 5,
    quote: 'Les cartes de fidélité dans Apple Wallet plaisent énormément. Les clients scannent, les points montent tout seuls, et ils reviennent. Un vrai plus au comptoir.',
  },
  {
    name: 'Julien M.', shop: 'Épicerie fine', city: 'Toulouse', stars: 4,
    quote: 'Installation accompagnée au top, catalogue prêt dès le premier jour. Il me tarde surtout de voir les prochaines nouveautés côté gestion de stock.',
  },
  {
    name: 'Élodie F.', shop: 'Torréfacteur', city: 'Strasbourg', stars: 5,
    quote: 'Le mode hors-ligne m’a sauvé un samedi de coupure réseau. On a continué à encaisser sans rien perdre, et tout s’est resynchronisé une fois la connexion revenue.',
  },
  {
    name: 'Antoine G.', shop: 'Jardinerie', city: 'Rennes', stars: 5,
    quote: 'Multi-boutiques, catalogue partagé, transferts de stock : on pilote nos trois points de vente comme s’il n’y en avait qu’un. Le back-office suit tout.',
  },
  {
    name: 'Laure P.', shop: 'Boutique cadeaux', city: 'Montpellier', stars: 5,
    quote: 'Les étiquettes code-barres imprimées à la volée et le scan au comptoir font gagner un temps fou sur les grosses journées. C’est fluide, même en rush.',
  },
  {
    name: 'Vincent C.', shop: 'Primeur', city: 'Annecy', stars: 5,
    quote: 'Simple pour l’équipe, complet pour moi. La conformité fiscale est intégrée, je n’y pense tout simplement plus. Exactement ce que je cherchais.',
  },
];

function Stars({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${n} sur 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"
             fill={i < n ? GOLD_LINE : 'none'} stroke={GOLD_LINE} strokeWidth="1.5">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  );
}

function initials(name: string): string {
  return name.split(' ').map((p) => p.charAt(0)).join('').slice(0, 2).toUpperCase();
}

export default async function ReviewsPage() {
  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';
  const avg = (REVIEWS.reduce((s, r) => s + r.stars, 0) / REVIEWS.length).toFixed(1).replace('.', ',');

  return (
    <>
      {/* -------------------------------------------------------------- HERO */}
      <section style={{ backgroundColor: GREEN }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-20">
          <div className="max-w-3xl">
            <Eyebrow onDark>Avis clients</Eyebrow>
            <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight text-white">
              Ils ont adopté {brand}.
            </h1>
            <p className="mt-4 text-lg" style={{ color: 'rgba(234,230,220,0.85)' }}>
              Des commerçants de tous horizons utilisent {brand} au quotidien.
              Voici, avec leurs mots, ce qui les a convaincus.
            </p>
            <div className="mt-6 inline-flex items-center gap-3 rounded-full px-4 py-2"
                 style={{ backgroundColor: 'rgba(255,239,179,0.15)' }}>
              <Stars n={5} />
              <span className="text-sm font-semibold" style={{ color: GOLD }}>
                {avg} / 5 · note moyenne
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- REVIEWS */}
      <section className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-24">
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-5">
          {REVIEWS.map((r) => (
            <figure
              key={r.name + r.shop}
              className="break-inside-avoid mb-5 rounded-2xl bg-white p-6"
              style={{ border: `1px solid ${BORDER}` }}
            >
              <Stars n={r.stars} />
              <blockquote className="mt-4 text-[15px] leading-relaxed" style={{ color: '#14211D' }}>
                « {r.quote} »
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold"
                      style={{ backgroundColor: GOLD, color: GREEN_DEEP }}>
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
        <p className="mt-8 text-center text-xs" style={{ color: '#5A625E' }}>
          Témoignages de commerçants utilisateurs. Prénoms abrégés pour préserver leur confidentialité.
        </p>
      </section>

      {/* --------------------------------------------------------- CTA BAND */}
      <section style={{ backgroundColor: IVORY, borderTop: `1px solid ${BORDER}` }}>
        <div className="max-w-4xl mx-auto px-5 sm:px-6 py-16 md:py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Envie de faire partie d’eux ?</h2>
          <p className="mt-4 text-lg" style={{ color: '#5A625E' }}>
            Réservez une démo : on vous montre {brand} sur votre propre catalogue, en 20 minutes.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <ButtonPrimary href="/contact">Réserver une démo gratuite</ButtonPrimary>
            <ButtonGhost href="/tarifs">Voir les tarifs</ButtonGhost>
          </div>
        </div>
      </section>
    </>
  );
}
