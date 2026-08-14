import { loadPlatform } from '@/lib/site/platform';
import {
  Eyebrow, ButtonPrimary, ButtonGhost, BrowserFrame, FeatureCard, Icon,
  GREEN, GREEN_DEEP, GOLD, BORDER, IVORY,
} from './_ui';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'HelloPos — La caisse des fleuristes',
  description:
    'Caisse iPad, catalogue, stock, fidélité, commande différée et pilotage à distance. Une seule application pour fleuristes et commerces végétaux, conforme à la réglementation française.',
};

const FEATURES = [
  {
    title: 'Caisse iPad rapide',
    icon: <Icon path={<><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M3 9h18M7 21h10" /></>} />,
    desc: 'Encaissement en quelques gestes, paniers en attente, prix libres, remises, tickets numériques et impression.',
  },
  {
    title: 'Catalogue & stock',
    icon: <Icon path={<><path d="M20 7 12 3 4 7l8 4 8-4Z" /><path d="M4 7v10l8 4 8-4V7" /><path d="M12 11v10" /></>} />,
    desc: 'Familles, variantes, codes-barres, étiquettes imprimées, inventaire par boutique et transferts de stock.',
  },
  {
    title: 'Fidélité & Wallet',
    icon: <Icon path={<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></>} />,
    desc: 'Programme de fidélité, cartes Apple Wallet dématérialisées, avoirs et cartes cadeaux suivis au client.',
  },
  {
    title: 'Commande différée',
    icon: <Icon path={<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>} />,
    desc: 'Retrait à date et livraison, écran atelier mural — pensé pour les mariages, deuils et commandes entreprises.',
  },
  {
    title: 'Pilotage à distance',
    icon: <Icon path={<><path d="M3 3v18h18" /><path d="m7 14 4-4 3 3 5-6" /></>} />,
    desc: 'Chiffre d’affaires en direct, marge, TVA, top produits, historiques. Sur mobile comme sur ordinateur.',
  },
  {
    title: 'Conforme, sereine',
    icon: <Icon path={<><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z" /><path d="m9 12 2 2 4-4" /></>} />,
    desc: 'Chaîne fiscale scellée (art. 286 CGI), rapport Z, exports comptables. La conformité, sans y penser.',
  },
];

const STEPS = [
  { n: '1', t: 'On installe avec vous', d: 'Catalogue, boutiques, caisses, imprimantes : votre configuration est prête le premier jour.' },
  { n: '2', t: 'Votre équipe encaisse', d: 'Connexion par code, tuiles familles, encaissement immédiat. Rien à apprendre.' },
  { n: '3', t: 'Vous pilotez à distance', d: 'Le back-office suit le CA, le stock et la caisse depuis n’importe où.' },
];

export default async function HomePage() {
  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';

  return (
    <>
      {/* ---------------------------------------------------------------- HERO */}
      <section style={{ backgroundColor: GREEN }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-6 pt-16 pb-14 md:pt-24 md:pb-20">
          <div className="max-w-3xl">
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest"
              style={{ backgroundColor: 'rgba(255,239,179,0.15)', color: GOLD }}
            >
              Fleuristes & commerces végétaux
            </span>
            <h1 className="mt-5 text-4xl md:text-6xl font-bold tracking-tight text-white" style={{ textWrap: 'balance' } as React.CSSProperties}>
              La caisse pensée pour votre boutique de fleurs.
            </h1>
            <p className="mt-5 text-lg md:text-xl leading-relaxed" style={{ color: 'rgba(234,230,220,0.85)' }}>
              Encaissement iPad, catalogue, stock, fidélité, commande différée et
              pilotage à distance. Une seule application, conforme à la
              réglementation française.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonPrimary href="/contact" onDark>Demander une démo</ButtonPrimary>
              <ButtonGhost href="/fonctionnalites" onDark>Voir les fonctionnalités</ButtonGhost>
            </div>
            <p className="mt-4 text-sm" style={{ color: 'rgba(234,230,220,0.6)' }}>
              Installation accompagnée · essai de 14 jours · sans engagement
            </p>
          </div>

          <div className="mt-12 md:mt-16">
            <BrowserFrame src="/site/screens/dashboard.png" alt={`Tableau de bord ${brand}`} />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ FEATURES */}
      <section className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-24">
        <div className="max-w-2xl">
          <Eyebrow>Tout au même endroit</Eyebrow>
          <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">
            Du comptoir au back-office, sans logiciel en plus.
          </h2>
          <p className="mt-3 text-base md:text-lg" style={{ color: '#5A625E' }}>
            {brand} réunit la caisse, le catalogue, la fidélité, la commande
            différée et la comptabilité. Une équipe, une application.
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
            <Eyebrow>Le comptoir</Eyebrow>
            <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">
              « Ma journée » : tout ce qui compte, en un écran.
            </h2>
            <p className="mt-4 text-base md:text-lg" style={{ color: '#5A625E' }}>
              Chiffre d’affaires du jour, panier moyen, répartition des règlements,
              trésorerie espèces et actions rapides. Ouvrez, encaissez, clôturez —
              la caisse suit, vous gardez la main.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                'Ouverture de la journée en un montant, partagée par tous les postes.',
                'Répartition des ventes par moyen de paiement, en direct.',
                'Clôture guidée, rapport Z imprimé sur l’imprimante ticket.',
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
          <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">Prête à encaisser, dès le premier jour.</h2>
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
          <BrowserFrame src="/site/screens/rapports.png" alt="Rapports" />
          <BrowserFrame src="/site/screens/cloture.png" alt="Clôture de caisse" />
        </div>
      </section>

      {/* ------------------------------------------------------------- CTA BAND */}
      <section style={{ backgroundColor: GREEN_DEEP }}>
        <div className="max-w-4xl mx-auto px-5 sm:px-6 py-16 md:py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
            Envie de voir {brand} sur votre comptoir ?
          </h2>
          <p className="mt-4 text-lg" style={{ color: 'rgba(234,230,220,0.8)' }}>
            Une démonstration de 20 minutes, adaptée à votre boutique. On vous
            montre l’encaissement, le pilotage et la conformité.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <ButtonPrimary href="/contact" onDark>Demander une démo</ButtonPrimary>
            <ButtonGhost href="/tarifs" onDark>Voir les tarifs</ButtonGhost>
          </div>
        </div>
      </section>
    </>
  );
}
