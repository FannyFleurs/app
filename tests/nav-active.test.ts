import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { activeNavHref } from '@/lib/nav/active';
import { SIDEBAR_ITEMS } from '@/components/Sidebar';

/**
 * Surlignage du menu.
 *
 * Le cas qui a motivé ces tests : dans le back-office, cliquer sur
 * « Utilisateurs » (/settings/users) allumait AUSSI « Paramètres »
 * (/settings), parce que chaque entrée décidait seule si le chemin
 * commençait par le sien.
 */

describe('Entrée de menu active', () => {
  it('n\'allume pas le parent quand une entrée plus précise existe', () => {
    const hrefs = ['/settings/users', '/settings'];
    expect(activeNavHref('/settings/users', hrefs)).toBe('/settings/users');
  });

  it('ne dépend pas de l\'ordre des entrées', () => {
    expect(activeNavHref('/settings/users', ['/settings', '/settings/users']))
      .toBe('/settings/users');
  });

  it('retombe sur le parent quand l\'entrée précise n\'est pas au menu', () => {
    // Onglets de caisse : « Transfert stock » peut être masqué, l'écran doit
    // rester situable sous « Stock ».
    expect(activeNavHref('/stock/transfer', ['/stock'])).toBe('/stock');
    expect(activeNavHref('/stock/transfer', ['/stock', '/stock/transfer']))
      .toBe('/stock/transfer');
  });

  it('n\'allume rien hors du menu', () => {
    expect(activeNavHref('/caisse', ['/settings', '/products'])).toBeNull();
    expect(activeNavHref(null, ['/settings'])).toBeNull();
  });

  it('ne confond pas deux chemins de même préfixe textuel', () => {
    // /settings/labels ne doit pas capter /settings/label-printer.
    const hrefs = ['/settings/labels', '/settings/label-printer'];
    expect(activeNavHref('/settings/label-printer', hrefs)).toBe('/settings/label-printer');
    expect(activeNavHref('/settings/labels', hrefs)).toBe('/settings/labels');
  });

  it('tolère une barre finale', () => {
    expect(activeNavHref('/settings/', ['/settings'])).toBe('/settings');
  });

  it('n\'allume jamais deux entrées du menu réel à la fois', () => {
    const hrefs = SIDEBAR_ITEMS.map((i) => i.href);
    // Chaque destination du menu, plus les sous-écrans qui ont posé problème.
    const paths = [...hrefs, '/settings/company', '/products/new', '/stock/transfer'];
    for (const p of paths) {
      const active = activeNavHref(p, hrefs);
      const allumees = hrefs.filter((h) => h === active);
      expect(allumees.length, `chemin ${p}`).toBeLessThanOrEqual(1);
    }
    // Et le cas signalé, sur le menu tel qu'il est réellement défini.
    expect(activeNavHref('/settings/users', hrefs)).toBe('/settings/users');
  });
});

describe('Périmètre des entrées', () => {
  it('garde « Ma journée » hors du back-office', () => {
    // Elle suit une caisse ouverte sur un poste : à distance il n'y a pas de
    // journée à tenir, c'est le tableau de bord qui répond.
    const maJournee = SIDEBAR_ITEMS.find((i) => i.href === '/ma-journee');
    expect(maJournee?.appOnly).toBe(true);

    const auBO = SIDEBAR_ITEMS.filter((i) => !i.appOnly).map((i) => i.href);
    expect(auBO).not.toContain('/ma-journee');
    expect(auBO).toContain('/dashboard');
  });

  it('garde « Étiquettes » hors du back-office', () => {
    // On imprime sur l'imprimante reliée au poste : la page n'a pas de sens
    // depuis un back-office à distance.
    expect(SIDEBAR_ITEMS.find((i) => i.href === '/labels')?.appOnly).toBe(true);
  });
});

describe('Écran des permissions', () => {
  it('nomme en français chaque permission et chaque domaine', () => {
    // Une permission ajoutée au code sans intitulé s'affichait telle quelle :
    // « ACCOUNTING » et « accounting.read » en plein écran français.
    const src = readFileSync('app/(app)/settings/permissions/RolePermissionsAdmin.tsx', 'utf8');
    const rbac = readFileSync('lib/auth/rbac.ts', 'utf8');
    const perms = [...new Set([...rbac.matchAll(/'([a-z_]+\.[a-z_.]+)'/g)].map((m) => m[1]!))]
      .filter((p) => /^(pos|products|categories|stock|customers|invoices|closures|fiscal|users|settings|accounting)\./.test(p));
    for (const perm of perms) expect(src, perm).toContain(`'${perm}':`);
    for (const domaine of new Set(perms.map((p) => p.split('.')[0]!))) {
      expect(src, domaine).toMatch(new RegExp(`^\\s*${domaine}: '`, 'm'));
    }
  });
});
