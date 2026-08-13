import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Gestion des utilisateurs : modifier et archiver depuis la fiche.
 *
 * Un compte créé par erreur devait pouvoir être corrigé ou retiré. La liste
 * n'ouvre plus qu'à « Modifier » ; l'archivage est une action de la fiche,
 * distincte de l'enregistrement des champs. La colonne email a quitté la
 * liste. Ces contrôles fixent le geste et ses garde-fous.
 */

const src = readFileSync('app/(app)/users/UsersAdmin.tsx', 'utf8');
const selectRoute = readFileSync('app/api/users/select/route.ts', 'utf8');

describe('Fiche utilisateur', () => {
  it('porte Archiver et Réactiver', () => {
    expect(src).toMatch(/>\s*Modifier\s*</);
    expect(src).toMatch(/>\s*Archiver\s*</);
    expect(src).toMatch(/>\s*Réactiver\s*</);
  });

  it('archive via is_active plutôt que par une suppression', () => {
    // On ne supprime jamais un compte : l'historique de ses ventes doit
    // rester attribuable. Archiver = is_active false.
    expect(src).toMatch(/is_active: !archive/);
    expect(src).toMatch(/method: 'PATCH'/);
  });

  it('interdit d\'archiver son propre compte', () => {
    // Se retirer soi-même l'accès enfermerait dehors : le bouton n'apparaît
    // pas quand on édite sa propre fiche.
    expect(src).toMatch(/user\.id !== currentUserId/);
  });

  it('demande confirmation avant d\'archiver', () => {
    expect(src).toMatch(/confirmThemed/);
  });
});

describe('Liste', () => {
  it('n\'affiche plus la colonne email', () => {
    // L'email n'a pas à s'étaler sur un écran face au magasin ; il reste dans
    // la fiche. La liste n'en porte plus la colonne.
    expect(src).not.toMatch(/>\s*Email\s*<\/th>/);
    expect(src).not.toMatch(/\{u\.email\}/);
  });
});

describe('Effet sur la caisse', () => {
  it('un compte archivé disparaît de l\'écran de connexion', () => {
    // La liste de sélection en caisse ne renvoie que les comptes actifs :
    // archiver retire donc bien l'utilisateur des tuiles de connexion.
    expect(selectRoute).toMatch(/is_active = TRUE/);
  });
});
