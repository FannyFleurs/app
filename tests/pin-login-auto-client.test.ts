import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Écran de connexion caisse (tuiles + PIN) : jusqu'ici, taper un code au
 * clavier physique n'avait aucun effet tant qu'aucune tuile n'était cliquée.
 * On peut désormais taper directement son code, sans toucher l'écran : le
 * compte correspondant est détecté et connecté (voir
 * /api/auth/pin-login-auto).
 *
 * PinLogin.tsx est un composant client sans rendu complet en test (même
 * choix que pour les autres composants de caisse de ce fichier) : on
 * vérifie la présence et la condition exacte sur la source.
 */
describe('PinLogin — saisie du PIN sans sélectionner de profil', () => {
  const page = readFileSync('app/login/PinLogin.tsx', 'utf8');

  it('le listener clavier gère aussi le cas où aucune tuile n\'est sélectionnée', () => {
    expect(page).toMatch(/if \(selectedId\) \{/);
    expect(page).toMatch(/\/\/ Aucune tuile choisie : saisie directe au clavier physique/);
  });

  it('accumule les chiffres dans un buffer séparé (autoPin), et soumet au 4e chiffre', () => {
    expect(page).toMatch(/const \[autoPin, setAutoPin\] = useState\(''\);/);
    expect(page).toMatch(/if \(next\.length === PIN_LENGTH\) void submitAuto\(next\);/);
  });

  it('appelle POST /api/auth/pin-login-auto avec le seul PIN (pas de user_id)', () => {
    expect(page).toMatch(/fetch\('\/api\/auth\/pin-login-auto', \{/);
    expect(page).toMatch(/body: JSON\.stringify\(\{ pin: pinValue \}\)/);
  });

  it('un succès déclenche la même transition/navigation que la connexion manuelle', () => {
    expect(page).toMatch(/async function submitAuto\(pinValue: string\) \{[\s\S]{0,600}setTransitioning\(true\);\s*window\.location\.assign\('\/caisse'\);/);
  });

  it('un échec affiche un message dédié (code inconnu, ambigu, trop d\'essais)', () => {
    expect(page).toMatch(/function prettyAutoError\(code\?: string, message\?: string\): string \{/);
    expect(page).toMatch(/case 'AMBIGUOUS_PIN':/);
    expect(page).toMatch(/case 'TOO_MANY_ATTEMPTS':/);
  });
});
