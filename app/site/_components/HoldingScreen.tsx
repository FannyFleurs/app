import Link from 'next/link';
import { loadPlatform } from '@/lib/site/platform';
import MinimalHeader from './MinimalHeader';
import HoldingContact from './HoldingContact';

/**
 * Écran affiché tant que le site public n'est pas activé.
 *
 * Il porte le titre de l'accueil — la marque, pas un message d'erreur —, une
 * description courte, et un seul geste possible : nous écrire. Le formulaire
 * s'ouvre sur place, sans quitter la page.
 *
 * Les accès applicatifs ne sont pas mis en avant : la connexion vit dans
 * l'en-tête, discrète, pour les commerçants qui la cherchent.
 *
 * Servi à la racine du domaine public (le gabarit du site le rend à la place
 * de l'accueil) et sur la route /indisponible, qui permet de le relire depuis
 * la console d'administration.
 */
export default async function HoldingScreen() {
  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';
  const year = new Date().getFullYear();

  const legal = [
    platform.company_legal_name,
    platform.company_siret ? `SIRET ${platform.company_siret}` : '',
    platform.company_vat ? `TVA ${platform.company_vat}` : '',
  ].filter(Boolean);

  return (
    <main
      style={{
        minHeight: '100svh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '3rem',
        paddingBlock: 'clamp(1.5rem, 4vh, 2.5rem) clamp(2.5rem, 6vh, 4rem)',
      }}
    >
      <MinimalHeader onDark />

      <div className="hp-container">
        <h1 className="hp-display" style={{ maxWidth: '14ch' }}>
          La caisse qui
          <br />
          fait <span className="hp-em">beaucoup plus</span>
          <br />
          que la caisse.
        </h1>
        <p className="hp-lede" style={{ marginTop: '2rem', maxWidth: '46ch' }}>
          {brand} réunit caisse, stocks, commandes, clients et pilotage dans une seule application
          pensée pour les commerçants.
        </p>

        <div style={{ marginTop: '2.5rem' }}>
          <HoldingContact />
        </div>
      </div>

      <div className="hp-container">
        <hr className="hp-rule" style={{ marginBottom: '1.25rem' }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.5rem', justifyContent: 'space-between' }}>
          <p className="hp-fine">
            © {year} {brand}
            {legal.length ? ` — ${legal.join(' · ')}` : ''}
          </p>
          <p className="hp-fine" style={{ display: 'flex', gap: '1.25rem' }}>
            <Link href="/mentions-legales">Mentions légales</Link>
            <Link href="/confidentialite">Confidentialité</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
