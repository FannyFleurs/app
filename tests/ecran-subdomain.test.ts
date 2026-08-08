import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

/**
 * Sous-domaine de l'écran atelier.
 *
 * L'écran est une application à part : une tablette murale ouvre
 * ecran.hellopos.fr et n'en sort jamais. Deux règles à ne pas casser — tout
 * chemin y mène à l'écran, et la connexion s'y fait à l'email de
 * l'organisation, jamais au code PIN de la caisse.
 */

const demande = (url: string) =>
  new NextRequest(url, { headers: { host: new URL(url).host } });

/** Chemin servi (réécriture) ou visé (redirection). */
function servi(url: string): string {
  const res = middleware(demande(url));
  const dest = res.headers.get('x-middleware-rewrite') ?? res.headers.get('location');
  return dest ? new URL(dest, url).pathname : new URL(url).pathname;
}

describe('ecran.hellopos.fr', () => {
  it('mène à l\'écran atelier quel que soit le chemin', () => {
    expect(servi('https://ecran.hellopos.fr/')).toBe('/ecran');
    expect(servi('https://ecran.hellopos.fr/caisse')).toBe('/ecran');
    expect(servi('https://ecran.hellopos.fr/dashboard')).toBe('/ecran');
    expect(servi('https://ecran.hellopos.fr/ecran')).toBe('/ecran');
  });

  it('sert la connexion par email, pas le code PIN de la caisse', () => {
    expect(servi('https://ecran.hellopos.fr/login')).toBe('/bo/login');
    expect(servi('https://ecran.hellopos.fr/bo/login')).toBe('/bo/login');
  });

  it('laisse passer les API et les fichiers statiques', () => {
    // L'écran interroge /api/orders/atelier : le réécrire vers /ecran le
    // priverait de ses données.
    expect(servi('https://ecran.hellopos.fr/api/orders/atelier')).toBe('/api/orders/atelier');
    expect(servi('https://ecran.hellopos.fr/manifest-ecran.json')).toBe('/manifest-ecran.json');
  });

  it('ne détourne pas les autres sous-domaines', () => {
    expect(servi('https://bo.hellopos.fr/dashboard')).toBe('/dashboard');
    expect(servi('https://app.hellopos.fr/caisse')).toBe('/caisse');
  });
});
