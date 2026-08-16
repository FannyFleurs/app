/**
 * Adresses des espaces applicatifs, déduites du domaine demandé.
 *
 * Sur un vrai domaine, chaque espace a son sous-domaine — mêmes règles que le
 * middleware. En préversion ou en local, où les sous-domaines n'existent pas,
 * on retombe sur les chemins équivalents.
 *
 * Partagé par la page de connexion du site et par la page d'attente affichée
 * quand le site public est dépublié : les deux doivent envoyer au même endroit.
 */

const KNOWN_SUBS = ['app.', 'bo.', 'ca.', 'admin.', 'pda.', 'ecran.', 'www.'];

export interface SpaceUrls {
  /** Vrai si le domaine n'a pas de sous-domaines exploitables. */
  preview: boolean;
  caisse: string;
  bo: string;
  ca: string | null;
  ecran: string | null;
  pda: string | null;
}

export function spaceUrls(rawHost: string | null): SpaceUrls {
  const host = (rawHost ?? '').toLowerCase().split(':')[0] ?? '';
  const preview = !host || host === 'localhost' || host.endsWith('.vercel.app');
  if (preview) {
    return { preview, caisse: '/login', bo: '/bo', ca: null, ecran: null, pda: null };
  }
  const base = KNOWN_SUBS.reduce((h, sub) => (h.startsWith(sub) ? h.slice(sub.length) : h), host);
  return {
    preview,
    caisse: `https://app.${base}`,
    bo: `https://bo.${base}`,
    ca: `https://ca.${base}`,
    ecran: `https://ecran.${base}`,
    pda: `https://pda.${base}`,
  };
}
