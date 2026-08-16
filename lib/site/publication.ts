/**
 * Publication du site public hellopos.fr.
 *
 * Un seul interrupteur, lu par le middleware, le plan du site et robots.txt.
 *
 *   SITE_PUBLIC=on   -> le site public est servi normalement
 *   (absent / autre) -> le site est DÉPUBLIÉ : l'apex n'affiche qu'une page
 *                       d'attente, et la création de compte est fermée.
 *
 * La valeur par défaut est volontairement « dépublié » : si la variable
 * disparaît d'un environnement, le site reste hors ligne plutôt que de se
 * publier tout seul.
 *
 * ⚠️ Ce réglage ne concerne QUE l'apex (hellopos.fr / www). Les espaces
 * applicatifs — app., bo., ca., ecran., pda., admin. — ne sont pas touchés :
 * les commerçants continuent d'encaisser, de piloter et de se connecter
 * exactement comme avant.
 *
 * Les préversions (*.vercel.app) et le développement local servent toujours
 * le site complet, pour pouvoir le relire pendant qu'il est hors ligne.
 */
export const SITE_PUBLIC = process.env.SITE_PUBLIC === 'on';

/** Chemin de la page d'attente affichée à la racine quand le site est hors ligne. */
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
