import Link from 'next/link';
import type { FaqItem } from '@/lib/site/content/faq';

/**
 * Accordéon de questions fréquentes.
 *
 * Construit sur <details>/<summary> : ouverture au clavier, fonctionnement
 * sans JavaScript, contenu présent dans le HTML pour l'indexation. Les
 * données structurées FAQPage ne sont émises qu'une seule fois sur le site
 * (page d'accueil) pour éviter les doublons.
 */
export default function Faq({
  items,
  withSchema = false,
  idPrefix = 'faq',
}: {
  items: FaqItem[];
  withSchema?: boolean;
  idPrefix?: string;
}) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <div className="hp-acc">
      {items.map((f, i) => (
        <details key={f.q} className="hp-acc-item" id={`${idPrefix}-${i + 1}`}>
          <summary>
            <span>{f.q}</span>
            <span className="hp-acc-sign" aria-hidden="true" />
          </summary>
          <div className="hp-acc-body">
            <p>{f.a}</p>
            {f.link ? (
              <p style={{ marginTop: '0.75rem' }}>
                {f.link.href.startsWith('/setup') ? (
                  <a className="hp-link" href={f.link.href} data-track="essai_hellopos">
                    {f.link.label}
                    <span className="hp-arrow" aria-hidden="true"> →</span>
                  </a>
                ) : (
                  <Link className="hp-link" href={f.link.href}>
                    {f.link.label}
                    <span className="hp-arrow" aria-hidden="true"> →</span>
                  </Link>
                )}
              </p>
            ) : null}
          </div>
        </details>
      ))}
      {withSchema ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      ) : null}
    </div>
  );
}
