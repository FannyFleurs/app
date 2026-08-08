import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * Ancienne adresse de l'écran atelier.
 *
 * Il vit désormais sur son propre sous-domaine (ecran.), en application
 * dédiée. On ne casse pas les favoris ni les tablettes déjà ouvertes sur
 * cette page : on les emmène à la nouvelle adresse.
 */
export default function AtelierRedirectPage() {
  redirect(ecranUrl(headers().get('host')));
}

/** Mêmes règles de sous-domaine que le middleware. */
function ecranUrl(rawHost: string | null): string {
  const host = (rawHost ?? '').toLowerCase().split(':')[0] ?? '';
  // Préversion et poste local n'ont pas de sous-domaines : le chemin fait foi.
  if (!host || host.endsWith('.vercel.app') || host === 'localhost') return '/ecran';
  const base = ['app.', 'bo.', 'ca.', 'admin.', 'pda.', 'ecran.', 'www.']
    .reduce((h, sub) => (h.startsWith(sub) ? h.slice(sub.length) : h), host);
  return `https://ecran.${base}`;
}
