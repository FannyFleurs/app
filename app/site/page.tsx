import Link from 'next/link';
import { query } from '@/lib/db/client';
import { mergePlatformDefaults, type PlatformSettings } from '@/lib/settings/platform';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'HelloPos — Caisse pour fleuristes',
  description:
    'Caisse SaaS moderne pour fleuristes et commerces végétaux : encaissement iPad, catalogue, stock, fidélité, conformité française.',
};

async function loadPlatform(): Promise<PlatformSettings> {
  try {
    const { rows } = await query<{ value: Partial<PlatformSettings> }>(
      `SELECT value FROM platform_settings WHERE id = 1`,
    );
    return mergePlatformDefaults(rows[0]?.value ?? null);
  } catch {
    return mergePlatformDefaults(null);
  }
}

const FEATURES = [
  {
    title: 'Caisse iPad',
    desc: 'Encaissement rapide, gestion des paniers en attente, commandes différées, TVA, tickets numériques.',
    icon: '🛍️',
  },
  {
    title: 'Multi-boutiques',
    desc: 'Gérez plusieurs boutiques et leurs caisses. Catalogues partagés ou distincts, transferts de stock.',
    icon: '🏬',
  },
  {
    title: 'Fidélité & Wallet',
    desc: 'Programme de fidélité intégré, cartes Apple Wallet dématérialisées, avoirs, cartes cadeaux.',
    icon: '💳',
  },
  {
    title: 'Commande différée',
    desc: 'Retrait à date et livraison, idéal pour les événements (mariages, deuils, entreprises).',
    icon: '📅',
  },
  {
    title: 'Conformité fiscale',
    desc: 'Chaîne fiscale certifiable (article 286 CGI), exports comptables FEC, journal Z, tickets sécurisés.',
    icon: '✅',
  },
  {
    title: 'Back-office distant',
    desc: 'Suivez le CA en direct, pilotez le catalogue et les stocks depuis n\'importe où (mobile, ordinateur).',
    icon: '📊',
  },
];

const PLANS = [
  {
    name: 'Essentiel',
    price: '29',
    tag: 'Boutique unique',
    features: [
      '1 boutique · 1 caisse',
      'Catalogue illimité',
      'Fidélité de base',
      'Support email',
    ],
    cta: 'Essayer 14 jours',
    highlight: false,
  },
  {
    name: 'Croissance',
    price: '59',
    tag: 'Le plus choisi',
    features: [
      '1 boutique · jusqu\'à 5 caisses',
      'Multi-postes + affichage client',
      'Écran & Livraison (commande différée)',
      'Wallet Apple, avoirs, cartes cadeaux',
      'Exports comptables · support prioritaire',
    ],
    cta: 'Essayer 14 jours',
    highlight: true,
  },
  {
    name: 'Réseau',
    price: 'Sur mesure',
    tag: 'Multi-boutiques',
    features: [
      'Boutiques illimitées',
      'Transferts de stock',
      'Rapports consolidés',
      'Onboarding + formation',
    ],
    cta: 'Nous contacter',
    highlight: false,
  },
];

export default async function LandingPage() {
  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';
  return (
    <main className="min-h-screen bg-white text-ink">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            {platform.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={platform.logo_url} alt={brand} className="h-9 w-9 rounded-xl object-contain" />
            ) : (
              <span
                className="grid h-9 w-9 place-items-center rounded-xl text-white font-semibold"
                style={{ backgroundColor: 'var(--primary, #6d5b3f)' }}
              >
                {brand.charAt(0)}
              </span>
            )}
            <span className="font-semibold tracking-tight">{brand}</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#features" className="text-ink-soft hover:text-ink">Fonctionnalités</a>
            <a href="#pricing" className="text-ink-soft hover:text-ink">Tarifs</a>
            <a href="/setup" className="text-ink-soft hover:text-ink">Créer une boutique</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn-ghost text-sm">Se connecter</Link>
            <Link href="/setup" className="btn-primary text-sm">Essai gratuit</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-20 text-center">
        <span className="inline-block rounded-full bg-accent-soft text-accent-deep text-xs font-semibold uppercase tracking-widest px-3 py-1">
          Nouveau
        </span>
        <h1 className="mt-4 text-4xl md:text-5xl font-semibold tracking-tight max-w-3xl mx-auto">
          La caisse pensée pour les fleuristes modernes.
        </h1>
        <p className="mt-4 text-lg text-ink-soft max-w-2xl mx-auto">
          Encaissement iPad, catalogue, stock, fidélité et pilotage à distance.
          Une seule app, conforme à la réglementation française.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/setup" className="btn-primary h-12 px-6 text-base">
            Démarrer l&apos;essai gratuit
          </Link>
          <a href="#features" className="btn-ghost h-12 px-6 text-base">
            Voir les fonctionnalités
          </a>
        </div>
        <p className="mt-4 text-xs text-ink-soft">
          14 jours d&apos;essai · sans carte bancaire · résiliation à tout moment
        </p>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-3xl font-semibold tracking-tight">Tout ce dont votre boutique a besoin</h2>
            <p className="mt-3 text-ink-soft">
              Du comptoir au back-office, {brand} couvre l&apos;ensemble des besoins d&apos;un fleuriste indépendant ou en réseau.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="card p-6">
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-semibold text-lg">{f.title}</h3>
                <p className="mt-2 text-sm text-ink-soft">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-border bg-white">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-3xl font-semibold tracking-tight">Des tarifs simples</h2>
            <p className="mt-3 text-ink-soft">
              Un forfait mensuel par boutique. Pas d&apos;engagement, pas de frais cachés.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PLANS.map((p, i) => {
              // Noms/prix personnalisables en configuration (ordre : Essentiel,
              // Croissance, Réseau).
              const name = i === 0
                ? (platform.plan_essentiel_name || p.name)
                : i === 1
                  ? (platform.plan_croissance_name || p.name)
                  : (platform.plan_reseau_name || p.name);
              const price = i === 0
                ? (platform.plan_essentiel_price || p.price)
                : i === 1
                  ? (platform.plan_croissance_price || p.price)
                  : (platform.plan_reseau_price || p.price);
              return (
              <div
                key={p.name}
                className={`card p-6 ${
                  p.highlight
                    ? 'border-2 border-accent shadow-lg'
                    : ''
                }`}
              >
                <div className="text-xs uppercase tracking-widest text-ink-soft font-semibold">
                  {p.tag}
                </div>
                <h3 className="mt-2 text-xl font-semibold">{name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold">{price}</span>
                  {/^[0-9]+([.,][0-9]+)?$/.test(String(price).trim()) && (
                    <span className="text-ink-soft">€ HT / mois</span>
                  )}
                </div>
                <ul className="mt-5 space-y-2 text-sm">
                  {p.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2">
                      <span className="text-accent-deep mt-0.5">✓</span>
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/setup"
                  className={`mt-6 block text-center h-11 leading-[44px] rounded-xl font-semibold ${
                    p.highlight ? 'btn-primary' : 'btn-soft'
                  }`}
                >
                  {p.cta}
                </Link>
              </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-gray-50">
        <div className="max-w-4xl mx-auto px-6 py-16 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Prêt à passer à {brand} ?</h2>
          <p className="mt-3 text-ink-soft">
            Créez votre compte en moins de 2 minutes et testez toutes les fonctionnalités pendant 14 jours.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link href="/setup" className="btn-primary h-12 px-6 text-base">
              Créer ma boutique
            </Link>
            <Link href="/login" className="btn-ghost h-12 px-6 text-base">
              J&apos;ai déjà un compte
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-white">
        <div className="max-w-6xl mx-auto px-6 py-8 space-y-4 text-sm text-ink-soft">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>© {new Date().getFullYear()} {brand}
              {platform.company_legal_name && ` — ${platform.company_legal_name}`}
            </div>
            <div className="flex gap-4">
              {platform.contact_email && (
                <a href={`mailto:${platform.contact_email}`} className="hover:text-ink">Contact</a>
              )}
              <Link href="/login" className="hover:text-ink">Caisse</Link>
              <Link href="/bo" className="hover:text-ink">Back-office</Link>
            </div>
          </div>
          {(platform.address_line1 || platform.company_siret || platform.contact_phone) && (
            <div className="text-xs text-ink-soft/80 space-y-0.5">
              {(platform.address_line1 || platform.address_city) && (
                <div>
                  {[platform.address_line1, [platform.address_zip, platform.address_city].filter(Boolean).join(' '), platform.address_country]
                    .filter(Boolean).join(', ')}
                </div>
              )}
              <div className="flex flex-wrap gap-x-4">
                {platform.company_siret && <span>SIRET {platform.company_siret}</span>}
                {platform.company_vat && <span>TVA {platform.company_vat}</span>}
                {platform.contact_phone && <span>Tél. {platform.contact_phone}</span>}
              </div>
            </div>
          )}
        </div>
      </footer>
    </main>
  );
}
