import { loadPlatform } from '@/lib/site/platform';
import { REVIEWS } from '@/lib/site/reviews';
import { pageMeta, SITE_URL } from '@/lib/site/meta';
import DemoVideo from './DemoVideo';
import {
  Eyebrow, ButtonPrimary, ButtonGhost, BrowserFrame, FeatureCard, Icon, initials,
  GREEN, GREEN_DEEP, GOLD, BORDER, IVORY,
} from './_ui';

export const dynamic = 'force-dynamic';
export const metadata = pageMeta({
  title: 'HelloPos — Le logiciel de caisse et de gestion des commerces',
  description:
    'Caisse, stocks, commandes, fidélité, facturation et pilotage réunis dans une seule application pensée pour les commerces indépendants. Réservez une démo gratuite.',
  path: '/',
});

// ---- Section « produit » : captures réelles du logiciel ----------------------
const PRODUCT_SHOTS = [
  { label: 'Encaissement', src: '/site/screens/caisse-paiement.png', alt: 'Écran d’encaissement', desc: 'Tout ce dont votre équipe a besoin pour vendre rapidement. Rien de plus.' },
  { label: 'Back-office', src: '/site/screens/dashboard.png', alt: 'Tableau de bord back-office', desc: 'Suivez votre activité et gérez votre commerce où que vous soyez.' },
  { label: 'Commandes', src: '/site/screens/commandes.png', alt: 'Gestion des commandes', desc: 'Centralisez les commandes à préparer, retraits et livraisons.' },
  { label: 'Stocks', src: '/site/screens/stock.png', alt: 'Gestion des stocks', desc: 'Réceptionnez, transférez, inventoriez et étiquetez depuis le même environnement.' },
];

// ---- Problème -> solution ----------------------------------------------------
const WITHOUT = [
  'Plusieurs outils différents à faire cohabiter',
  'Des commandes sur papier ou dans des notes',
  'Des stocks difficiles à suivre',
  'Une fidélité séparée de la caisse',
  'Des informations dispersées',
  'Des chiffres consultables depuis certains postes seulement',
  'Des ressaisies inutiles',
];
const WITH = ['Caisse', 'Stocks', 'Commandes', 'Clients', 'Fidélité', 'Facturation', 'Pilotage'];

// ---- Grandes fonctionnalités (catégories) ------------------------------------
const CATEGORIES = [
  {
    title: 'Encaisser',
    icon: <Icon path={<><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M3 9h18M7 21h10" /></>} />,
    items: ['Caisse tactile', 'Recherche & scan articles', 'Plusieurs modes de règlement', 'Tickets, avoirs, cartes cadeaux', 'Comptes utilisateurs'],
  },
  {
    title: 'Produits & stocks',
    icon: <Icon path={<><path d="M20 7 12 3 4 7l8 4 8-4Z" /><path d="M4 7v10l8 4 8-4V7" /><path d="M12 11v10" /></>} />,
    items: ['Catalogue & variantes', 'Stock par boutique', 'Entrées & inventaires', 'Transferts', 'Étiquettes & PDA'],
  },
  {
    title: 'Commandes',
    icon: <Icon path={<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>} />,
    items: ['Commandes différées', 'Retraits à date', 'Livraisons', 'Suivi des statuts', 'Préparation'],
  },
  {
    title: 'Relation client',
    icon: <Icon path={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9" /></>} />,
    items: ['Fichiers clients & historique', 'Programme de fidélité', 'Avantages', 'Cartes Apple Wallet', 'Avoirs suivis au client'],
  },
  {
    title: 'Piloter',
    icon: <Icon path={<><path d="M3 3v18h18" /><path d="m7 14 4-4 3 3 5-6" /></>} />,
    items: ['Chiffre d’affaires en direct', 'Indicateurs & rapports', 'Clôtures & rapport Z', 'Suivi à distance', 'Exports comptables'],
  },
  {
    title: 'Développer son réseau',
    icon: <Icon path={<><path d="M3 21h18" /><path d="M5 21V8l7-5 7 5v13" /><path d="M9 21v-6h6v6" /></>} />,
    items: ['Plusieurs boutiques', 'Stocks par boutique', 'Transferts inter-boutiques', 'Utilisateurs & droits', 'Vision consolidée'],
  },
];

// ---- Pourquoi HelloPos -------------------------------------------------------
const WHY = [
  {
    title: 'Un outil qui évolue avec vous',
    icon: <Icon path={<><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></>} />,
    desc: 'Une boutique aujourd’hui, plusieurs demain : HelloPos accompagne le développement de votre activité sans vous obliger à changer d’environnement.',
  },
  {
    title: 'Votre activité au même endroit',
    icon: <Icon path={<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>} />,
    desc: 'Caisse, stocks, commandes, fidélité, facturation et pilotage fonctionnent ensemble, sans double saisie ni logiciel en plus.',
  },
  {
    title: 'Un tarif clair',
    icon: <Icon path={<><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" /></>} />,
    desc: 'Des abonnements simples et lisibles, adaptés à la taille et aux besoins de votre commerce.',
  },
  {
    title: 'Pensé pour le quotidien',
    icon: <Icon path={<><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z" /><path d="m9 12 2 2 4-4" /></>} />,
    desc: 'Une interface conçue pour rester rapide en boutique, tout en proposant un back-office complet.',
  },
];

// ---- Commerces (aperçu ; les pages métier dédiées arrivent) ------------------
const TRADES = [
  { name: 'Fleuristes', desc: 'Commandes à préparer, livraisons, comptes pros.' },
  { name: 'Cavistes', desc: 'Catalogue riche, étiquettes, fidélité.' },
  { name: 'Jardineries', desc: 'Stocks, transferts, multi-rayons.' },
  { name: 'Concept stores', desc: 'Multi-familles, cartes cadeaux, réseau.' },
  { name: 'Épiceries fines', desc: 'Scan rapide, comptes clients, factures.' },
];

function ReassuranceLine({ price }: { price: string }) {
  return (
    <p className="mt-4 text-sm" style={{ color: 'rgba(234,230,220,0.6)' }}>
      Dès {price} € HT/mois · 14 jours gratuits · Sans engagement
    </p>
  );
}

export default async function HomePage() {
  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';
  const startPrice = platform.plan_essentiel_price || '29';

  const plans = [
    { name: platform.plan_essentiel_name || 'Smart', price: platform.plan_essentiel_price || '29', tag: 'Boutique unique' },
    { name: platform.plan_croissance_name || 'Pro', price: platform.plan_croissance_price || '39', tag: 'Le plus choisi', highlight: true },
    { name: platform.plan_reseau_name || 'Réseau', price: platform.plan_reseau_price || '69', tag: 'Multi-boutiques' },
  ];

  // Donnees structurees : SoftwareApplication + Offer. Pas d'AggregateRating :
  // aucune note verifiable a ce jour (on ne publie pas de note fabriquee).
  const appLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: brand,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'iPadOS, Web',
    url: SITE_URL,
    offers: { '@type': 'Offer', price: (startPrice || '29').replace(',', '.'), priceCurrency: 'EUR' },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }} />

      {/* 2. HERO ------------------------------------------------------------- */}
      <section style={{ backgroundColor: GREEN }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-6 pt-16 pb-14 md:pt-24 md:pb-20 grid lg:grid-cols-2 lg:gap-12 lg:items-center">
          <div className="max-w-2xl">
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest"
              style={{ backgroundColor: 'rgba(255,239,179,0.15)', color: GOLD }}
            >
              Pour les commerçants indépendants
            </span>
            <h1 className="mt-5 text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white" style={{ textWrap: 'balance' } as React.CSSProperties}>
              Vendez vite. Gérez tout votre commerce sans effort.
            </h1>
            <p className="mt-5 text-lg md:text-xl leading-relaxed" style={{ color: 'rgba(234,230,220,0.85)' }}>
              Caisse, stocks, commandes, fidélité, facturation et pilotage réunis
              dans une seule application pensée pour les commerces indépendants.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonPrimary href="/contact" onDark>Réserver une démo gratuite</ButtonPrimary>
              <ButtonGhost href="#produit" onDark>Découvrir HelloPos</ButtonGhost>
            </div>
            <ReassuranceLine price={startPrice} />
          </div>

          <div className="mt-12 lg:mt-0">
            <BrowserFrame src="/site/screens/caisse.png" alt={`Écran de caisse ${brand}`} priority />
          </div>
        </div>
      </section>

      {/* 3. TRUST STRIP ----------------------------------------------------- */}
      <section style={{ backgroundColor: '#fff', borderBottom: `1px solid ${BORDER}` }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-5 text-center">
          <span className="text-sm" style={{ color: '#5A625E' }}>
            Utilisé au quotidien par des fleuristes, cavistes, jardineries, concept stores et épiceries fines.
          </span>
        </div>
      </section>

      {/* 4-5. PRODUIT : caisse devant, puissance derrière ------------------- */}
      <section id="produit" className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-24 scroll-mt-20">
        <div className="max-w-2xl">
          <Eyebrow>Le produit</Eyebrow>
          <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">
            Une caisse simple devant. Toute la puissance derrière.
          </h2>
          <p className="mt-3 text-base md:text-lg" style={{ color: '#5A625E' }}>
            HelloPos simplifie le quotidien en boutique sans sacrifier les outils
            dont vous avez besoin pour gérer votre activité.
          </p>
        </div>

        <div className="mt-10">
          <BrowserFrame src="/site/screens/caisse.png" alt="Écran de caisse HelloPos" />
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {PRODUCT_SHOTS.map((s) => (
            <div key={s.label}>
              <BrowserFrame src={s.src} alt={s.alt} />
              <h3 className="mt-4 font-semibold text-lg">{s.label}</h3>
              <p className="mt-1 text-sm" style={{ color: '#5A625E' }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 6. PROBLÈME -> SOLUTION -------------------------------------------- */}
      <section style={{ backgroundColor: IVORY, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-24">
          <div className="max-w-3xl">
            <Eyebrow>La simplification</Eyebrow>
            <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">
              Moins d’outils, moins de manipulations, plus de temps.
            </h2>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-2 lg:items-stretch">
            <div className="rounded-2xl bg-white p-6 md:p-8" style={{ border: `1px solid ${BORDER}` }}>
              <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#5A625E' }}>Sans HelloPos</div>
              <ul className="mt-4 space-y-3 text-sm">
                {WITHOUT.map((w) => (
                  <li key={w} className="flex items-start gap-3" style={{ color: '#5A625E' }}>
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: '#C7C2B4' }} />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl p-6 md:p-8 flex flex-col justify-center" style={{ backgroundColor: GREEN, color: '#fff' }}>
              <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: GOLD }}>Avec HelloPos</div>
              <p className="mt-4 text-3xl md:text-4xl font-bold tracking-tight">Une seule application.</p>
              <div className="mt-6 flex flex-wrap gap-2">
                {WITH.map((w) => (
                  <span key={w} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium" style={{ backgroundColor: 'rgba(255,239,179,0.15)', color: GOLD }}>
                    <Icon path={<path d="m5 12 4 4L19 6" />} />{w}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. GRANDES FONCTIONNALITÉS ----------------------------------------- */}
      <section className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-24">
        <div className="max-w-2xl">
          <Eyebrow>Tout le métier, réuni</Eyebrow>
          <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">
            De l’encaissement au réseau de boutiques.
          </h2>
          <p className="mt-3 text-base md:text-lg" style={{ color: '#5A625E' }}>
            Chaque besoin de votre commerce, traité au bon endroit, sans quitter HelloPos.
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c) => (
            <div key={c.title} className="site-card rounded-2xl bg-white p-6 border" style={{ borderColor: BORDER }}>
              <div className="grid h-11 w-11 place-items-center rounded-xl" style={{ backgroundColor: GOLD, color: GREEN_DEEP }}>
                {c.icon}
              </div>
              <h3 className="mt-4 font-semibold text-lg">{c.title}</h3>
              <ul className="mt-3 space-y-1.5 text-sm" style={{ color: '#5A625E' }}>
                {c.items.map((it) => (
                  <li key={it} className="flex items-start gap-2">
                    <span className="mt-0.5" style={{ color: GREEN }}><Icon path={<path d="m5 12 4 4L19 6" />} /></span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <ButtonGhost href="/fonctionnalites">Voir toutes les fonctionnalités</ButtonGhost>
        </div>
      </section>

      {/* DEMO VIDEO (si configurée) ----------------------------------------- */}
      {platform.demo_video_url && (
        <section style={{ backgroundColor: IVORY, borderTop: `1px solid ${BORDER}` }}>
          <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-24">
            <div className="max-w-2xl mx-auto text-center">
              <Eyebrow>En 2 minutes</Eyebrow>
              <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">Voir HelloPos en 2 minutes.</h2>
              <p className="mt-3 text-base md:text-lg" style={{ color: '#5A625E' }}>
                Un aperçu de l’encaissement, des commandes, des stocks et du pilotage.
              </p>
            </div>
            <div className="mt-10 max-w-4xl mx-auto">
              <DemoVideo url={platform.demo_video_url} poster="/site/screens/caisse.png" />
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <ButtonPrimary href="/contact">Réserver une démo</ButtonPrimary>
            </div>
          </div>
        </section>
      )}

      {/* 8. POURQUOI HELLOPOS ----------------------------------------------- */}
      <section style={{ backgroundColor: IVORY, borderTop: `1px solid ${BORDER}` }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-24">
          <div className="max-w-2xl">
            <Eyebrow>Pourquoi HelloPos</Eyebrow>
            <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">Pourquoi choisir HelloPos ?</h2>
            <p className="mt-3 text-base md:text-lg" style={{ color: '#5A625E' }}>
              Parce qu’un logiciel de caisse doit simplifier votre commerce, pas lui ajouter des contraintes.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {WHY.map((w) => (
              <FeatureCard key={w.title} icon={w.icon} title={w.title}>{w.desc}</FeatureCard>
            ))}
          </div>
        </div>
      </section>

      {/* 9. COMMERCES ------------------------------------------------------- */}
      <section className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-24">
        <div className="max-w-2xl">
          <Eyebrow>Pour votre métier</Eyebrow>
          <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">Adapté à votre commerce.</h2>
          <p className="mt-3 text-base md:text-lg" style={{ color: '#5A625E' }}>
            Les mêmes fondations, des usages qui collent à votre activité.
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TRADES.map((t) => (
            <a key={t.name} href="/fonctionnalites" className="site-card rounded-2xl bg-white p-6 border block" style={{ borderColor: BORDER }}>
              <h3 className="font-semibold text-lg" style={{ color: GREEN }}>{t.name}</h3>
              <p className="mt-1.5 text-sm" style={{ color: '#5A625E' }}>{t.desc}</p>
            </a>
          ))}
        </div>
      </section>

      {/* 10. TÉMOIGNAGES ---------------------------------------------------- */}
      <section style={{ backgroundColor: IVORY, borderTop: `1px solid ${BORDER}` }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-24">
          <div className="max-w-2xl">
            <Eyebrow>Ils l’utilisent</Eyebrow>
            <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">Des commerçants comme vous.</h2>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {REVIEWS.slice(0, 3).map((r) => (
              <figure key={r.name + r.shop} className="rounded-2xl bg-white p-6" style={{ border: `1px solid ${BORDER}` }}>
                <blockquote className="text-[15px] leading-relaxed" style={{ color: '#14211D' }}>« {r.quote} »</blockquote>
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
          <p className="mt-6 text-xs" style={{ color: '#5A625E' }}>
            Retours d’utilisateurs, présentés à titre d’exemple. Prénoms abrégés pour préserver leur confidentialité.
          </p>
        </div>
      </section>

      {/* 11. TARIFS (aperçu) ------------------------------------------------ */}
      <section className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-24">
        <div className="max-w-2xl">
          <Eyebrow>Tarifs</Eyebrow>
          <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">Simple, par boutique, sans surprise.</h2>
          <p className="mt-3 text-base md:text-lg" style={{ color: '#5A625E' }}>
            Un forfait mensuel, sans engagement. La conformité fiscale est comprise.
          </p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {plans.map((p) => {
            const isNum = /^[0-9]+([.,][0-9]+)?$/.test(String(p.price).trim());
            return (
              <div key={p.name} className="rounded-2xl bg-white p-6 flex flex-col"
                   style={{ border: p.highlight ? `2px solid ${GREEN}` : `1px solid ${BORDER}` }}>
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: GREEN }}>{p.tag}</span>
                <h3 className="mt-2 text-xl font-bold">{p.name}</h3>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold">{p.price}</span>
                  {isNum && <span className="text-sm" style={{ color: '#5A625E' }}>€ HT / mois</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonPrimary href="/tarifs">Voir les tarifs en détail</ButtonPrimary>
          <ButtonGhost href="/contact">Réserver une démo</ButtonGhost>
        </div>
      </section>

      {/* 12. ÉTUDE DE CAS --------------------------------------------------- */}
      <section style={{ backgroundColor: IVORY, borderTop: `1px solid ${BORDER}` }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-24">
          <div className="max-w-2xl">
            <Eyebrow>Sur le terrain</Eyebrow>
            <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">HelloPos dans de vrais commerces.</h2>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            <div className="rounded-2xl bg-white p-6 lg:col-span-2" style={{ border: `1px solid ${BORDER}` }}>
              <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: GREEN }}>Fleuriste</div>
              <h3 className="mt-2 text-xl font-bold">Fanny Fleurs</h3>
              <p className="mt-2 text-sm md:text-base" style={{ color: '#5A625E' }}>
                Comment HelloPos réunit caisse, commandes, livraisons, stocks et
                pilotage dans un commerce aux besoins opérationnels variés.
              </p>
              {/* Étude de cas détaillée à venir (contenu réel, sans chiffres inventés). */}
              <div className="mt-5">
                <ButtonGhost href="/contact">Parler de votre commerce</ButtonGhost>
              </div>
            </div>
            <div className="rounded-2xl p-6 flex flex-col justify-center" style={{ backgroundColor: GREEN, color: '#fff' }}>
              <p className="text-lg font-semibold">Un cas proche du vôtre ?</p>
              <p className="mt-2 text-sm" style={{ color: 'rgba(234,230,220,0.85)' }}>
                On vous montre HelloPos sur votre propre organisation, en 20 minutes.
              </p>
              <div className="mt-5">
                <ButtonPrimary href="/contact" onDark>Réserver une démo</ButtonPrimary>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 13. CONFORMITÉ / ACCOMPAGNEMENT ------------------------------------ */}
      <section className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-24">
        <div className="grid gap-5 sm:grid-cols-3">
          {[
            { t: 'Conforme à la loi', d: 'Chaîne fiscale scellée (art. 286 CGI), rapport Z et exports comptables intégrés.', href: '/conformite', cta: 'La conformité' },
            { t: 'Installation accompagnée', d: 'Catalogue, boutiques, caisses et imprimantes : vous démarrez prêt.', href: '/contact', cta: 'En savoir plus' },
            { t: 'Vos données protégées', d: 'Sauvegardes et hébergement en France via nos prestataires. Vous restez maître de vos données.', href: '/confidentialite', cta: 'Confidentialité' },
          ].map((c) => (
            <div key={c.t} className="site-card rounded-2xl bg-white p-6 border flex flex-col" style={{ borderColor: BORDER }}>
              <h3 className="font-semibold text-lg">{c.t}</h3>
              <p className="mt-2 text-sm flex-1" style={{ color: '#5A625E' }}>{c.d}</p>
              <a href={c.href} className="mt-4 text-sm font-semibold inline-flex items-center gap-1" style={{ color: GREEN }}>
                {c.cta}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* 15. CTA FINAL ------------------------------------------------------ */}
      <section style={{ backgroundColor: GREEN_DEEP }}>
        <div className="max-w-4xl mx-auto px-5 sm:px-6 py-16 md:py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white">Prêt à découvrir HelloPos ?</h2>
          <p className="mt-4 text-lg" style={{ color: 'rgba(234,230,220,0.8)' }}>
            Voyez en quelques minutes comment HelloPos peut s’adapter à votre commerce.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <ButtonPrimary href="/contact" onDark>Réserver une démo gratuite</ButtonPrimary>
            <ButtonGhost href="/tarifs" onDark>Voir les tarifs</ButtonGhost>
          </div>
          <p className="mt-4 text-sm" style={{ color: 'rgba(234,230,220,0.6)' }}>14 jours gratuits · Sans engagement</p>
        </div>
      </section>
    </>
  );
}
