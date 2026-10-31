import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Route /api/auth/pin-login-auto : connexion par PIN seul (sans tuile). La
 * route dépend de cookies()/headers() (indisponibles hors contexte de
 * requête Next.js — voir pin-login-auto-match.test.ts pour le cœur de la
 * logique de détection, testé directement). Ici : vérification statique des
 * points de sécurité qui ne sont PAS couverts par ce test DB (schéma,
 * anti-bruteforce par poste, gestion de l'ambiguïté).
 */
describe('/api/auth/pin-login-auto — schéma et anti-bruteforce', () => {
  const page = readFileSync('app/api/auth/pin-login-auto/route.ts', 'utf8');

  it('le schéma n\'accepte QUE le PIN, jamais un user_id (sinon ce ne serait plus une détection)', () => {
    expect(page).toMatch(/const schema = z\.object\(\{ pin: z\.string\(\)\.regex\(\/\^\\d\{4\}\$\/\) \}\);/);
    expect(page).not.toMatch(/user_id/);
  });

  it('refuse plusieurs comptes partageant le même PIN plutôt que de deviner', () => {
    expect(page).toMatch(/if \(matches\.length > 1\)/);
    expect(page).toMatch(/jsonError\('AMBIGUOUS_PIN', 409\)/);
  });

  it('limite les tentatives PAR POSTE (device_id/ip), pas par compte', () => {
    expect(page).toMatch(/payload->>'device_id' = \$3/);
    expect(page).toMatch(/ip = \$4::inet/);
    expect(page).toMatch(/jsonError\('TOO_MANY_ATTEMPTS', 429/);
  });

  it('journalise les échecs sous une action dédiée, distincte du flux manuel', () => {
    expect(page).toMatch(/FAILED_ACTION = 'auth\.pin_login_auto\.failed'/);
    expect(page).toMatch(/'auth\.pin_login_auto\.ok'/);
  });
});
