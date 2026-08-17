import Link from 'next/link';
import { loadPlatform } from '@/lib/site/platform';
import MinimalHeader from './MinimalHeader';
import HoldingContact from './HoldingContact';
import Visual from './Visual';
import LegalLine from './LegalLine';

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
 * À droite du texte sur grand écran, le produit : la mise en scène déclarée
 * sous l'emplacement `attente-appareils`, ou à défaut l'écran de caisse réel
 * dans une tablette. Sous 1000 px, le visuel passe sous le texte, pleine
 * largeur — un montage tablette + téléphone n'est plus lisible en colonne
 * étroite.
 *
 * Servi à la racine du domaine public (le gabarit du site le rend à la place
 * de l'accueil) et sur la route /indisponible, qui permet de le relire depuis
 * la console d'administration.
 */
export default async function HoldingScreen() {
  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';

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

      <div className="hp-container hp-holding">
        <div>
          <h1 className="hp-display" style={{ maxWidth: '14ch' }}>
            La caisse qui
            <br />
            fait <span className="hp-em">beaucoup plus</span>
            <br />
            que la caisse.
          </h1>
          <p className="hp-lede" style={{ marginTop: '2rem', maxWidth: '42ch' }}>
            {brand} réunit caisse, stocks, commandes, clients et pilotage dans une seule application
            pensée pour les commerçants.
          </p>

          <div style={{ marginTop: '2.5rem' }}>
            <HoldingContact />
          </div>
        </div>

        {/* Mise en scène du produit : le montage tablette + téléphone déclaré
            sous l'emplacement `attente-appareils`. Si l'emplacement venait à
            être vidé, c'est l'écran de caisse réel qui reprend la place, dans
            une tablette dessinée. */}
        <div className="hp-holding-visual">
          <Visual
            slot="attente-appareils"
            frame="tablet"
            ratio="auto"
            priority
            screen={{
              src: '/site/screens/caisse.png',
              alt: `Écran de caisse ${brand} sur tablette`,
            }}
            sizes="(max-width: 999px) 100vw, 45vw"
          />
        </div>
      </div>

      <div className="hp-container">
        <hr className="hp-rule" style={{ marginBottom: '1.25rem' }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.5rem', justifyContent: 'space-between' }}>
          <LegalLine platform={platform} brand={brand} />
          <p className="hp-fine" style={{ display: 'flex', gap: '1.25rem' }}>
            <Link href="/mentions-legales">Mentions légales</Link>
            <Link href="/confidentialite">Confidentialité</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
