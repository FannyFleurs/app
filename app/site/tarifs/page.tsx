import { loadPlatform } from '@/lib/site/platform';
import { pageMeta } from '@/lib/site/meta';
import {
  Eyebrow, ButtonPrimary, Icon, GREEN, GREEN_DEEP, GOLD, GOLD_LINE, BORDER, IVORY,
} from '../_ui';

export const dynamic = 'force-dynamic';
export const metadata = pageMeta({
  title: 'Tarifs — HelloPos',
  description:
    'Un forfait mensuel par boutique, sans engagement. Trois formules : Smart, Pro et Réseau. Essai de 14 jours, installation accompagnée.',
  path: '/tarifs',
});

const PLANS = [
  {
    name: 'Smart', price: '29', tag: 'Boutique unique', highlight: false,
    features: ['1 boutique · 1 caisse', 'Catalogue illimité', 'Fidélité de base', 'Conformité fiscale incluse', 'Support par email'],
  },
  {
    name: 'Pro', price: '39', tag: 'Le plus choisi', highlight: true,
    features: ['1 boutique · jusqu’à 5 caisses', 'Multi-postes + affichage client', 'Écran & Livraison (commande différée)', 'Wallet Apple, avoirs, cartes cadeaux', 'Exports comptables', 'Support prioritaire'],
  },
  {
    name: 'Réseau', price: '69', tag: 'Multi-boutiques', highlight: false,
    features: ['Boutiques illimitées', 'Transferts de stock', 'Rapports consolidés', 'Onboarding + formation', 'Accompagnement dédié'],
  },
];

/**
 * Tableau comparatif. Valeurs issues des listes d'offres du projet :
 *   true = inclus · false = non inclus · 'texte' = précision · null = à préciser.
 * Les `null` sont des PLACEHOLDERS assumés : la disponibilité par offre n'est
 * pas connue à ce jour et doit être renseignée (ne rien inventer).
 */
type Cell = boolean | string | null;
const CMP_ROWS: { label: string; v: [Cell, Cell, Cell] }[] = [
  { label: 'Encaissement tactile', v: [true, true, true] },
  { label: 'Catalogue articles', v: [true, true, true] },
  { label: 'Conformité fiscale', v: [true, true, true] },
  { label: 'Nombre de caisses', v: ['1', 'Jusqu’à 5', null] },
  { label: 'Multi-postes + affichage client', v: [false, true, true] },
  { label: 'Utilisateurs', v: [null, null, null] },
  { label: 'Fidélité', v: ['De base', true, true] },
  { label: 'Cartes Apple Wallet', v: [null, true, true] },
  { label: 'Cartes cadeaux', v: [null, true, true] },
  { label: 'Avoirs', v: [null, true, true] },
  { label: 'Commandes · retraits · livraisons', v: [null, true, true] },
  { label: 'Facturation', v: [null, null, null] },
  { label: 'Comptes professionnels', v: [null, null, null] },
  { label: 'Exports comptables', v: [null, true, true] },
  { label: 'Multi-boutiques', v: [false, false, true] },
  { label: 'Transferts de stock', v: [false, false, true] },
  { label: 'Rapports', v: [true, true, 'Consolidés'] },
  { label: 'Support', v: ['Email', 'Prioritaire', 'Dédié'] },
];

const FAQ = [
  { q: 'Y a-t-il un engagement ?', a: 'Non. L’abonnement est mensuel et résiliable à tout moment. Vos données restent exportables.' },
  { q: 'L’essai est-il vraiment gratuit ?', a: 'Oui, 14 jours pour tester toutes les fonctionnalités. L’installation se fait avec vous, sans carte bancaire.' },
  { q: 'Le matériel est-il compris ?', a: 'HelloPos fonctionne sur tablette avec une imprimante ticket réseau. On vous conseille le matériel adapté à votre comptoir.' },
  { q: 'Est-ce conforme à la loi française ?', a: 'Oui : chaîne fiscale scellée (art. 286 CGI), rapport Z, exports comptables. La conformité est intégrée, pas en option.' },
];

/** Équivalent journalier (≈ prix / 30) pour un prix mensuel numérique. */
function perDay(price: string): string | null {
  const n = Number(String(price).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return `≈ ${(n / 30).toFixed(2).replace('.', ',')} € / jour`;
}

function Check() {
  return <span className="inline-flex" style={{ color: GREEN }} aria-label="inclus"><Icon path={<path d="m5 12 4 4L19 6" />} /></span>;
}

function Cellule({ value }: { value: Cell }) {
  if (value === true) return <Check />;
  if (value === false) return <span className="text-sm" style={{ color: '#C7C2B4' }} aria-label="non inclus">—</span>;
  if (value === null) return <span className="text-xs italic" style={{ color: '#9A968A' }}>à préciser</span>;
  return <span className="text-sm" style={{ color: '#14211D' }}>{value}</span>;
}

export default async function PricingPage() {
  const platform = await loadPlatform();
  const label = (i: number, d: string) =>
    (i === 0 ? platform.plan_essentiel_name : i === 1 ? platform.plan_croissance_name : platform.plan_reseau_name) || d;
  const price = (i: number, d: string) =>
    (i === 0 ? platform.plan_essentiel_price : i === 1 ? platform.plan_croissance_price : platform.plan_reseau_price) || d;
  const names = PLANS.map((p, i) => label(i, p.name));

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
        <div className="grid gap-5 md:grid-cols-3">
          {PLANS.map((p, i) => {
            const shownPrice = price(i, p.price);
            const isNum = /^[0-9]+([.,][0-9]+)?$/.test(String(shownPrice).trim());
            const daily = isNum ? perDay(shownPrice) : null;
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
                  <span className="text-4xl font-bold">{shownPrice}</span>
                  {isNum && <span style={{ color: '#5A625E' }}>€ HT / mois</span>}
                </div>
                {daily && <div className="mt-1 text-sm" style={{ color: '#5A625E' }}>{daily}</div>}
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
                  {i === 2 ? 'Parler à un conseiller' : 'Réserver une démo'}
                </a>
              </div>
            );
          })}
        </div>
        <p className="mt-6 text-center text-sm" style={{ color: '#5A625E' }}>
          Tous les prix sont hors taxes. Installation et reprise de catalogue accompagnées.
        </p>
      </section>

      {/* ------------------------------------------------ TABLEAU COMPARATIF */}
      <section style={{ backgroundColor: IVORY, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-24">
          <div className="text-center max-w-2xl mx-auto">
            <Eyebrow>Comparatif</Eyebrow>
            <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">Comparez les offres.</h2>
          </div>

          <div className="mt-10 overflow-x-auto rounded-2xl bg-white" style={{ border: `1px solid ${BORDER}` }}>
            <table className="w-full min-w-[560px] text-left border-collapse">
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <th className="sticky left-0 bg-white px-4 py-4 text-sm font-semibold" style={{ minWidth: 220 }}>Fonctionnalités</th>
                  {names.map((n, i) => (
                    <th key={n} className="px-4 py-4 text-center text-sm font-semibold" style={{ color: i === 1 ? GREEN : '#14211D' }}>
                      {n}{i === 1 && <span className="ml-1.5 align-middle rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: GOLD, color: GREEN_DEEP }}>Reco</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CMP_ROWS.map((row, ri) => (
                  <tr key={row.label} style={{ borderTop: ri === 0 ? 'none' : `1px solid ${BORDER}`, backgroundColor: ri % 2 ? 'rgba(248,246,240,0.5)' : '#fff' }}>
                    <th scope="row" className="sticky left-0 px-4 py-3 text-sm font-medium text-left" style={{ backgroundColor: ri % 2 ? '#FBFAF6' : '#fff', color: '#14211D' }}>
                      {row.label}
                    </th>
                    {row.v.map((cell, ci) => (
                      <td key={ci} className="px-4 py-3 text-center">
                        <div className="flex justify-center"><Cellule value={cell} /></div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs" style={{ color: '#5A625E' }}>
            ✓ inclus · — non inclus · « à préciser » : détail communiqué sur demande. Faites défiler horizontalement le tableau sur mobile.
          </p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-5 sm:px-6 py-16 md:py-24">
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
          <ButtonPrimary href="/contact">Réserver une démo gratuite</ButtonPrimary>
        </div>
      </section>
    </>
  );
}
