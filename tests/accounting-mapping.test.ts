import { describe, it, expect } from 'vitest';
import {
  resolveSalesAccount, groupByAccount, formatRate,
  type SalesAccountRule,
} from '@/lib/services/accounting-mapping';

/**
 * Ventilation des ventes par compte comptable.
 *
 * Le comptable attend un compte par famille de produit, taux de TVA et
 * boutique — « 70731200 - PLANTES 10% PLANTES VERTE ». Comme saisir une ligne
 * par croisement serait vite intenable, chaque critère peut rester à « toutes »
 * et la règle la plus précise l'emporte. Ces tests fixent cette priorité, qui
 * est la seule chose subtile du dispositif.
 */

const BOUTIQUE_A = '11111111-1111-4111-8111-111111111111';
const BOUTIQUE_B = '22222222-2222-4222-8222-222222222222';
const PLANTES = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOUGIES = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const regle = (
  p: Partial<SalesAccountRule> & Pick<SalesAccountRule, 'account_code'>,
): SalesAccountRule => ({
  id: p.account_code, store_id: null, category_id: null, vat_rate: null,
  account_label: p.account_code, ...p,
});

describe('Choix du compte', () => {
  it('retient la règle la plus précise', () => {
    const rules = [
      regle({ account_code: 'GLOBAL' }),
      regle({ account_code: 'FAMILLE', category_id: PLANTES }),
      regle({ account_code: 'FAMILLE+TAUX', category_id: PLANTES, vat_rate: 10 }),
      regle({ account_code: 'TOUT', store_id: BOUTIQUE_A, category_id: PLANTES, vat_rate: 10 }),
    ];
    const choisi = (scope: Parameters<typeof resolveSalesAccount>[1]) =>
      resolveSalesAccount(rules, scope)?.account_code;

    expect(choisi({ store_id: BOUTIQUE_A, category_id: PLANTES, vat_rate: 10 })).toBe('TOUT');
    expect(choisi({ store_id: BOUTIQUE_B, category_id: PLANTES, vat_rate: 10 })).toBe('FAMILLE+TAUX');
    expect(choisi({ store_id: BOUTIQUE_B, category_id: PLANTES, vat_rate: 20 })).toBe('FAMILLE');
    expect(choisi({ store_id: BOUTIQUE_B, category_id: BOUGIES, vat_rate: 20 })).toBe('GLOBAL');
  });

  it('fait primer la boutique sur la famille', () => {
    // Un groupe décline d'abord son plan par établissement : à nombre égal de
    // critères, la règle de boutique doit l'emporter.
    const rules = [
      regle({ account_code: 'PAR-BOUTIQUE', store_id: BOUTIQUE_A }),
      regle({ account_code: 'PAR-FAMILLE', category_id: PLANTES }),
    ];
    expect(resolveSalesAccount(rules, {
      store_id: BOUTIQUE_A, category_id: PLANTES, vat_rate: 20,
    })?.account_code).toBe('PAR-BOUTIQUE');
  });

  it('ne renvoie rien plutôt que d\'inventer un compte', () => {
    const rules = [regle({ account_code: 'X', store_id: BOUTIQUE_A })];
    expect(resolveSalesAccount(rules, {
      store_id: BOUTIQUE_B, category_id: null, vat_rate: 20,
    })).toBeNull();
    expect(resolveSalesAccount([], { store_id: null, category_id: null, vat_rate: 20 })).toBeNull();
  });

  it('couvre les articles sans famille avec une règle « toutes familles »', () => {
    const rules = [regle({ account_code: 'DIVERS', vat_rate: 20 })];
    expect(resolveSalesAccount(rules, {
      store_id: BOUTIQUE_A, category_id: null, vat_rate: 20,
    })?.account_code).toBe('DIVERS');
  });

  it('compare les taux au centième, pas à l\'identique', () => {
    // Un taux relu depuis `numeric` peut valoir 5.50 là où la règle dit 5.5.
    const rules = [regle({ account_code: 'REDUIT', vat_rate: 5.5 })];
    expect(resolveSalesAccount(rules, {
      store_id: null, category_id: null, vat_rate: 5.5001,
    })?.account_code).toBe('REDUIT');
    expect(resolveSalesAccount(rules, {
      store_id: null, category_id: null, vat_rate: 10,
    })).toBeNull();
  });
});

describe('Regroupement par compte', () => {
  const lignes = [
    { store_id: BOUTIQUE_A, category_id: PLANTES, vat_rate: 10, ht: 100, tva: 10, ttc: 110,
      category_name: 'Plantes', store_name: 'Plante Verte' },
    { store_id: BOUTIQUE_A, category_id: PLANTES, vat_rate: 10, ht: 50, tva: 5, ttc: 55,
      category_name: 'Plantes', store_name: 'Plante Verte' },
    { store_id: BOUTIQUE_A, category_id: BOUGIES, vat_rate: 20, ht: 40, tva: 8, ttc: 48,
      category_name: 'Bougies', store_name: 'Plante Verte' },
  ];

  it('somme les lignes qui tombent sur le même compte', () => {
    const rules = [
      regle({ account_code: '70731200', account_label: 'PLANTES 10%', category_id: PLANTES, vat_rate: 10 }),
      regle({ account_code: '70762000', account_label: 'BOUGIES 20%', category_id: BOUGIES, vat_rate: 20 }),
    ];
    const totaux = groupByAccount(lignes, rules);
    expect(totaux).toHaveLength(2);
    const plantes = totaux.find((t) => t.account_code === '70731200')!;
    expect(plantes).toMatchObject({ ht: 150, tva: 15, ttc: 165, fallback: false });
  });

  it('trie par numéro de compte, comme un grand livre', () => {
    const rules = [
      regle({ account_code: '70762000', category_id: BOUGIES, vat_rate: 20 }),
      regle({ account_code: '70731200', category_id: PLANTES, vat_rate: 10 }),
    ];
    expect(groupByAccount(lignes, rules)
      .map((t) => t.account_code)).toEqual(['70731200', '70762000']);
  });

  it('n\'invente aucun numéro de compte', () => {
    // Il n'y a plus de « compte de ventes global » : un croisement non
    // paramétré sort sans numéro, nommé, et signalé comme à renseigner.
    // Lui donner un numéro plausible revenait à ranger sous une décision que
    // personne n'avait prise.
    const totaux = groupByAccount(lignes, []);
    expect(totaux.every((t) => t.fallback)).toBe(true);
    expect(totaux.every((t) => t.account_code === '')).toBe(true);
    expect(totaux.map((t) => t.account_label)).toContain('Plantes · 10 % · Plante Verte');
    // Les croisements distincts ne se fondent pas les uns dans les autres.
    expect(totaux).toHaveLength(2);
  });

  it('conserve le total quelle que soit la ventilation', () => {
    const somme = (ts: ReturnType<typeof groupByAccount>) =>
      Math.round(ts.reduce((a, t) => a + t.ttc, 0) * 100) / 100;
    const avec = groupByAccount(lignes, [
      regle({ account_code: '70731200', category_id: PLANTES, vat_rate: 10 }),
    ]);
    const sans = groupByAccount(lignes, []);
    expect(somme(avec)).toBe(213);
    expect(somme(sans)).toBe(213);
  });
});

describe('Affichage du taux', () => {
  it('supprime les décimales inutiles', () => {
    expect(formatRate(20)).toBe('20');
    expect(formatRate(5.5)).toBe('5,5');
    expect(formatRate(2.1)).toBe('2,1');
  });
});
