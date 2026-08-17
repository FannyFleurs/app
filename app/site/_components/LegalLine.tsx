import type { PlatformSettings } from '@/lib/settings/platform';

/**
 * Ligne d'ours du pied de page : « © 2026 HelloPos — Swebio · SIRET … ».
 *
 * Le nom de l'éditeur renvoie chez lui quand son site est renseigné
 * (Configuration → Société). Sans site, il reste en texte simple : on
 * n'affiche jamais un lien vers une adresse qu'on n'a pas.
 *
 * Les mentions absentes ne sont pas affichées — pas de valeur inventée pour
 * remplir la ligne.
 */
export default function LegalLine({
  platform,
  brand,
  className = 'hp-fine',
}: {
  platform: PlatformSettings;
  brand: string;
  className?: string;
}) {
  const year = new Date().getFullYear();
  const editor = platform.company_legal_name.trim();
  const site = platform.company_website.trim();

  const rest = [
    platform.company_siret ? `SIRET ${platform.company_siret}` : '',
    platform.company_vat ? `TVA ${platform.company_vat}` : '',
  ].filter(Boolean);

  return (
    <p className={className}>
      © {year} {brand}
      {editor ? (
        <>
          {' — '}
          {site ? (
            <a className="hp-legal-link" href={site} target="_blank" rel="noreferrer noopener">
              {editor}
            </a>
          ) : (
            editor
          )}
        </>
      ) : null}
      {rest.length ? `${editor ? ' · ' : ' — '}${rest.join(' · ')}` : ''}
    </p>
  );
}
