// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * hellopos.fr/ (apex) est réécrit vers /projet par middleware.ts — c'est
 * donc la VRAIE page d'accueil publique. Elle doit respecter le réglage
 * « Site public » (Configuration → Site public) exactement comme /site/* :
 * avant ce correctif, /projet affichait toujours son contenu, qu'il soit
 * publié ou non — dépublier le site depuis la console d'administration ne
 * changeait rien à l'accueil, seulement aux pages secondaires (tarifs,
 * fonctions…).
 */

const redirectMock = vi.fn();
vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('next/headers', () => ({ headers: () => ({ get: () => 'hellopos.fr' }) }));

let sitePublic = true;
vi.mock('@/lib/site/publication', () => ({
  isSitePublic: async () => sitePublic,
  HOLDING_PATH: '/indisponible',
}));

vi.mock('@/lib/site/platform', () => ({
  loadPlatform: async () => ({
    plan_essentiel_price: '29', plan_croissance_price: '59', plan_reseau_price: '69', addon_register_price: '9',
  }),
}));

const { default: ProjetPage } = await import('@/app/projet/page');

beforeEach(() => {
  redirectMock.mockClear();
  sitePublic = true;
});

describe('Page d\'accueil publique (/projet, apex hellopos.fr/) — réglage Site public', () => {
  it('site dépublié : redirige vers la page d\'attente (/indisponible), sans rendre le contenu commercial', async () => {
    sitePublic = false;
    await ProjetPage();
    expect(redirectMock).toHaveBeenCalledWith('/indisponible');
  });

  it('site publié : ne redirige pas, rend bien la page de présentation', async () => {
    sitePublic = true;
    const result = await ProjetPage();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });
});
