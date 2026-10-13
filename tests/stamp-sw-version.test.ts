import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveVersion, stampVersion } from '@/scripts/stamp-sw-version';

/**
 * Bug remonté en production : l'app restait « figée dans l'ancien thème »
 * après connexion tant qu'on ne cliquait pas quelque part. Cause : le
 * service worker (public/sw.js) retombe sur son cache si le réseau échoue
 * au moment de la navigation, mais sa constante VERSION — qui est le SEUL
 * signal faisant détecter une mise à jour au navigateur — n'avait pas bougé
 * depuis 3 semaines, malgré de nombreux changements d'interface. Le cache de
 * repli pouvait donc être nettement plus ancien que l'app actuelle.
 *
 * Corrigé en faisant varier le contenu de public/sw.js (donc sa VERSION) à
 * CHAQUE déploiement, automatiquement, au lieu de compter sur un bump manuel.
 */
describe('scripts/stamp-sw-version — tamponne public/sw.js à chaque build', () => {
  it('remplace la constante VERSION par la valeur donnée', () => {
    const src = "const VERSION = 'v4';\nconst CACHE = 'webpos-' + VERSION;\n";
    const out = stampVersion(src, 'abc123');
    expect(out).toBe("const VERSION = 'abc123';\nconst CACHE = 'webpos-' + VERSION;\n");
  });

  it('renvoie null si la constante VERSION est introuvable (fichier inattendu)', () => {
    expect(stampVersion('// pas de constante ici', 'abc123')).toBeNull();
  });

  it('resolveVersion priorise VERCEL_GIT_COMMIT_SHA (tronqué à 12) quand il est présent', () => {
    const v = resolveVersion({ VERCEL_GIT_COMMIT_SHA: 'a1b2c3d4e5f6a7b8c9d0' });
    expect(v).toBe('a1b2c3d4e5f6'); // 12 premiers caractères
  });

  it('resolveVersion retombe sur le SHA git local hors Vercel (jamais une valeur figée)', () => {
    const v = resolveVersion({});
    expect(v).not.toBe('');
    expect(v).not.toBe('v4'); // la valeur figée qui a causé le bug
  });

  it('public/sw.js committé porte un PLACEHOLDER, jamais une version figée en dur', () => {
    // Garde-fou direct contre la régression : si quelqu'un re-bump VERSION à
    // la main dans le fichier source (au lieu de laisser le script de build
    // le faire), ce test échoue — c'est exactement ce qui a causé le bug.
    const src = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
    const match = src.match(/const VERSION = '([^']*)';/);
    expect(match).not.toBeNull();
    expect(match![1]).not.toBe('v4'); // la valeur figée qui a causé le bug
    expect(stampVersion(src, 'test-stamp')).not.toBeNull(); // la regex de build la retrouve bien
  });
});
