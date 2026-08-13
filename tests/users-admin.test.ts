import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Gestion des utilisateurs : modifier et archiver depuis la liste.
 *
 * Un compte créé par erreur devait pouvoir être corrigé ou retiré. La fiche
 * d'édition existait déjà ; ce qui manquait, c'était de pouvoir archiver un
 * compte d'un geste, sans deviner que la case « Compte actif » de la fiche
 * fait office d'archivage. Ces contrôles fixent le geste et ses garde-fous.
 */

const src = readFileSync('app/(app)/users/UsersAdmin.tsx', 'utf8');
const selectRoute = readFileSync('app/api/users/select/route.ts', 'utf8');

describe('Actions de la liste', () => {
  it('propose Modifier et Archiver/Réactiver sur chaque ligne', () => {
    expect(src).toMatch(/>\s*Modifier\s*</);
    expect(src).toMatch(/>\s*Archiver\s*</);
    expect(src).toMatch(/>\s*Réactiver\s*</);
  });

  it('archive via is_active plutôt que par une suppression', () => {
    // On ne supprime jamais un compte : l'historique de ses ventes doit
    // rester attribuable. Archiver = is_active false.
    expect(src).toMatch(/is_active:/);
    expect(src).toMatch(/method: 'PATCH'/);
  });

  it('interdit d\'archiver son propre compte', () => {
    // Se retirer soi-même l'accès enfermerait dehors : le bouton n'apparaît
    // pas sur sa propre ligne.
    expect(src).toMatch(/u\.id !== currentUserId/);
  });

  it('demande confirmation avant d\'archiver', () => {
    expect(src).toMatch(/confirmThemed/);
  });
});

describe('Effet sur la caisse', () => {
  it('un compte archivé disparaît de l\'écran de connexion', () => {
    // La liste de sélection en caisse ne renvoie que les comptes actifs :
    // archiver retire donc bien l'utilisateur des tuiles de connexion.
    expect(selectRoute).toMatch(/is_active = TRUE/);
  });
});
