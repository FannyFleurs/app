import { Button, Eyebrow } from './_components/ui';
import { TRADES } from '@/lib/site/content/trades';
import Link from 'next/link';

/**
 * Page introuvable, à l'intérieur du site public : on garde l'en-tête, le
 * pied de page, et on propose des chemins utiles plutôt qu'un cul-de-sac.
 */
export default function SiteNotFound() {
  return (
    <section className="hp-section">
      <div className="hp-container hp-container--text">
        <Eyebrow>Erreur 404</Eyebrow>
        <h1 className="hp-h1" style={{ marginTop: '1.25rem' }}>
          Cette page n’existe pas.
        </h1>
        <p className="hp-lede" style={{ marginTop: '1.25rem' }}>
          Le lien est peut-être ancien, ou la page a changé d’adresse. Voici par où reprendre.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem', marginTop: '2rem' }}>
          <Button href="/">Retour à l’accueil</Button>
          <Button href="/fonctionnalites" variant="ghost">Fonctionnalités</Button>
          <Button href="/tarifs" variant="ghost">Tarifs</Button>
        </div>

        <p className="hp-label" style={{ marginTop: '3rem' }}>Par métier</p>
        <ul style={{ listStyle: 'none', margin: '1.25rem 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {TRADES.map((t) => (
            <li key={t.slug}>
              <Link href={`/solutions/${t.slug}`} className="hp-chip">{t.label}</Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
