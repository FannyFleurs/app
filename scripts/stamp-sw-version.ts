import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

/**
 * Tamponne public/sw.js avec un identifiant UNIQUE à ce déploiement, pour
 * que le navigateur détecte une mise à jour du service worker.
 *
 * Bug remonté en production : l'app restait « figée dans l'ancien thème »
 * (ancienne mise en page, chiffres non chargés) après connexion, tant que
 * l'utilisateur ne cliquait pas quelque part. Cause : public/sw.js est servi
 * en network-first, mais retombe sur SA DERNIÈRE VERSION EN CACHE si le
 * réseau échoue (coupure brève juste après la redirection de connexion —
 * un cas réel, pas exotique). Le navigateur ne détecte une mise à jour du
 * service worker lui-même QUE si le contenu du fichier sw.js change — or sa
 * constante VERSION n'avait pas bougé depuis sa création (3 semaines),
 * malgré de nombreux changements d'interface depuis. Le cache servi en repli
 * pouvait donc être bien antérieur au thème/à l'app actuels, sans que le
 * navigateur n'ait jamais eu de raison de l'invalider.
 *
 * Corrigé en faisant varier le contenu de sw.js (donc sa VERSION, et le nom
 * du cache qui en dépend) à CHAQUE déploiement, automatiquement — fini de
 * compter sur un bump manuel oublié à chaque changement visuel. Exécuté
 * avant `next build` dans `vercel-build` (voir package.json).
 */
export function resolveVersion(env: Record<string, string | undefined> = process.env): string {
  if (env.VERCEL_GIT_COMMIT_SHA) return env.VERCEL_GIT_COMMIT_SHA.slice(0, 12);
  try {
    return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  } catch {
    return `local-${Date.now()}`;
  }
}

/** Remplace la constante VERSION par la valeur donnée. Renvoie `null` si la
 *  constante est introuvable (fichier inattendu — build interrompu). */
export function stampVersion(src: string, version: string): string | null {
  const next = src.replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`);
  return next === src ? null : next;
}

function main() {
  const file = path.join(process.cwd(), 'public', 'sw.js');
  const src = readFileSync(file, 'utf8');
  const version = resolveVersion();
  const next = stampVersion(src, version);
  if (next === null) {
    // eslint-disable-next-line no-console
    console.error('⚠ Constante VERSION introuvable dans public/sw.js — fichier inchangé, build interrompu.');
    process.exit(1);
  }
  writeFileSync(file, next);
  // eslint-disable-next-line no-console
  console.log(`✓ public/sw.js : VERSION = '${version}'`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
