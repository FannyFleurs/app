import { loadPlatform } from '@/lib/site/platform';
import {
  Eyebrow, ButtonPrimary, Icon, GREEN, GREEN_DEEP, GOLD, GOLD_LINE, BORDER, IVORY,
} from '../_ui';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Tarifs — HelloPos',
  description:
    'Un forfait mensuel par boutique, sans engagement. Trois formules : Essentiel, Croissance et Réseau. Essai de 14 jours, installation accompagnée.',
};

const PLANS = [
  {
    name: 'Essentiel', price: '29', tag: 'Boutique unique', highlight: false,
    features: ['1 boutique · 1 caisse', 'Catalogue illimité', 'Fidélité de base', 'Conformité fiscale incluse', 'Support par email'],
  },
  {
    name: 'Croissance', price: '59', tag: 'Le plus choisi', highlight: true,
    features: ['1 boutique · jusqu’à 5 caisses', 'Multi-postes + affichage client', 'Écran & Livraison (commande différée)', 'Wallet Apple, avoirs, cartes cadeaux', 'Exports comptables', 'Support prioritaire'],
  },
  {
    name: 'Réseau', price: 'Sur mesure', tag: 'Multi-boutiques', highlight: false,
    features: ['Boutiques illimitées', 'Transferts de stock', 'Rapports consolidés', 'Onboarding + formation', 'Accompagnement dédié'],
  },
];

const FAQ = [
  { q: 'Y a-t-il un engagement ?', a: 'Non. L’abonnement est mensuel et résiliable à tout moment. Vos données restent exportables.' },
  { q: 'L’essai est-il vraiment gratuit ?', a: 'Oui, 14 jours pour tester toutes les fonctionnalités. L’installation se fait avec vous, sans carte bancaire.' },
  { q: 'Le matériel est-il compris ?', a: 'HelloPos fonctionne sur tablette avec une imprimante ticket réseau. On vous conseille le matériel adapté à votre comptoir.' },
  { q: 'Est-ce conforme à la loi française ?', a: 'Oui : chaîne fiscale scellée (art. 286 CGI), rapport Z, exports comptables. La conformité est intégrée, pas en option.' },
];

export default async function PricingPage() {
  const platform = await loadPlatform();
  const label = (i: number, d: string) =>
    (i === 0 ? platform.plan_essentiel_name : i === 1 ? platform.plan_croissance_name : platform.plan_reseau_name) || d;
  const price = (i: number, d: string) =>
    (i === 0 ? platform.plan_essentiel_price : i === 1 ? platform.plan_croissance_price : platform.plan_reseau_price) || d;

  return (
    <>
      <section style={{ backgroundColor: GREEN }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-20 text-center">
          <Eyebrow onDark>Tarifs</Eyebrow>
          <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight text-white">Simple, par boutique, sans surprise.</h1>
          <p className="mt-4 text-lg max-w-2xl mx-auto" style={{ color: 'rgba(234,230,220,0.85)' }}>
            Un forfait mensuel, pas de frais cachés, pas d’engagement. La
            conformité fiscale est comprise dans chaque formule.
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 sm:px-6 -mt-10 md:-mt-12 pb-16 md:pb-24">
        <div className="grid gap-5 md:grid-cols-3 items-start">
          {PLANS.map((p, i) => {
            const isNum = /^[0-9]+([.,][0-9]+)?$/.test(String(price(i, p.price)).trim());
            return (
              <div
                key={p.name}
                className="rounded-2xl bg-white p-7 flex flex-col"
                style={{
                  border: p.highlight ? `2px solid ${GREEN}` : `1px solid ${BORDER}`,
                  boxShadow: p.highlight ? '0 24px 50px -24px rgba(1,43,38,0.4)' : 'none',
                  ...(p.highlight ? { transform: 'translateY(-6px)' } : {}),
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: GREEN }}>{p.tag}</span>
                  {p.highlight && (
                    <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: GOLD, color: GREEN_DEEP }}>
                      Recommandé
                    </span>
                  )}
                </div>
                <h2 className="mt-2 text-2xl font-bold">{label(i, p.name)}</h2>
                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-4xl font-bold">{price(i, p.price)}</span>
                  {isNum && <span style={{ color: '#5A625E' }}>€ HT / mois</span>}
                </div>
                <ul className="mt-6 space-y-2.5 text-sm flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <span className="mt-0.5" style={{ color: GREEN }}><Icon path={<path d="m5 12 4 4L19 6" />} /></span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="/contact"
                  className="site-btn mt-7 inline-flex items-center justify-center h-12 rounded-xl text-base font-semibold"
                  style={p.highlight
                    ? { backgroundColor: GREEN, color: '#fff' }
                    : { color: GREEN, border: `1px solid ${GOLD_LINE}`, backgroundColor: IVORY }}
                >
                  {i === 2 ? 'Nous contacter' : 'Demander une démo'}
                </a>
              </div>
            );
          })}
        </div>
        <p className="mt-6 text-center text-sm" style={{ color: '#5A625E' }}>
          Tous les prix sont hors taxes. Installation et reprise de catalogue accompagnées.
        </p>
      </section>

      <section style={{ backgroundColor: IVORY, borderTop: `1px solid ${BORDER}` }}>
        <div className="max-w-4xl mx-auto px-5 sm:px-6 py-16 md:py-24">
          <div className="text-center max-w-2xl mx-auto">
            <Eyebrow>Questions fréquentes</Eyebrow>
            <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">Ce qu’on nous demande souvent.</h2>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {FAQ.map((f) => (
              <div key={f.q} className="rounded-2xl bg-white p-6" style={{ border: `1px solid ${BORDER}` }}>
                <h3 className="font-semibold">{f.q}</h3>
                <p className="mt-2 text-sm" style={{ color: '#5A625E' }}>{f.a}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <ButtonPrimary href="/contact">Demander une démo</ButtonPrimary>
          </div>
        </div>
      </section>
    </>
  );
}
