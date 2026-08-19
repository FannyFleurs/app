import 'server-only';
import { loadPlatform } from './platform';

/**
 * Publication du site public hellopos.fr.
 *
 * L'état est un réglage de la plateforme (`platform_settings.site_public`),
 * piloté depuis la console d'administration → Configuration → Site public.
 * Il n'y a rien à redéployer : le site bascule à la requête suivante.
 *
 * Par défaut, le site n'est PAS publié : une plateforme fraîchement installée
 * n'expose que la page d'attente tant que quelqu'un n'a pas activé le site.
 *
 * ⚠️ Ce réglage ne concerne QUE le site public. Les espaces applicatifs —
 * app., bo., ca., ecran., pda., admin. — ne sont jamais affectés : les
 * commerçants continuent d'encaisser et de piloter leur activité.
 *
 * `SITE_PUBLIC=on` reste un forçage d'environnement, utile pour relire le
 * site complet sur une préversion pendant qu'il est hors ligne en production.
 */
export async function isSitePublic(): Promise<boolean> {
  if (process.env.SITE_PUBLIC === 'on') return true;
  const platform = await loadPlatform();
  return platform.site_public === true;
}

/** Route de la page d'attente (également servie à la racine quand le site est hors ligne). */
export const HOLDING_PATH = '/indisponible';

/**
 * Ressources statiques du site (polices, captures, photos, image de partage).
 * Elles restent servies même hors ligne : la page d'attente s'en sert.
 */
export function isSiteAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/site/fonts/') ||
    pathname.startsWith('/site/screens/') ||
    pathname.startsWith('/site/photos/') ||
    pathname === '/site/og.png'
  );
}

/**
 * Pages servies même quand le site public n'est pas publié :
 *  - mentions légales et confidentialité : le formulaire de la page d'attente
 *    y renvoie, et une page qui collecte des coordonnées doit dire ce qu'elle
 *    en fait ;
 *  - support : c'est l'URL d'assistance déclarée sur l'App Store / Play Store,
 *    qui doit rester joignable indépendamment de l'état du site vitrine.
 */
export function isLegalPath(pathname: string): boolean {
  const p = pathname.replace(/^\/site/, '') || '/';
  return p === '/mentions-legales' || p === '/confidentialite' || p === '/support';
}

/** Vrai si le chemin demandé est l'accueil du site (apex ou préversion). */
export function isSiteHome(pathname: string): boolean {
  return pathname === '/' || pathname === '/site' || pathname === '/site/';
}
