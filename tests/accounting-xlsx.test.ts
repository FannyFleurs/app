import { describe, it, expect } from 'vitest';
import { buildSalesXlsx, accountCell } from '@/lib/services/accounting-xlsx';
import { type AccountTotal } from '@/lib/services/accounting-mapping';

/**
 * Mise en page de l'export « Ventes par compte » en Excel.
 *
 * Le comptable de Plante Vertes attend un fichier au format exact d'un modèle :
 * deux lignes par famille (compte de ventes puis compte de TVA), un repère de
 * période en colonne C, une ligne « VENTES » qui porte le CA, et un total qui
 * équilibre. Ces tests fixent cette forme.
 */

function total(over: Partial<AccountTotal>): AccountTotal {
  return {
    account_code: '707312', account_label: 'PLANTES 10% PLANTES VERTES',
    ht: 100, tva: 10, ttc: 110, fallback: false,
    vat_account_code: '44571', vat_account_label: 'TVA 10%', vat_rate: 10,
    ...over,
  };
}

describe('accountCell', () => {
  it('rend un nombre pour un code purement chiffré', () => {
    expect(accountCell('707312')).toBe(707312);
    expect(accountCell('13')).toBe(13);
  });
  it('garde le texte pour un code à zéro de tête', () => {
    // 007 n'est pas le nombre 7 : un compte se lit tel qu'il est saisi.
    expect(accountCell('007')).toBe('007');
  });
  it('rend null pour un compte absent', () => {
    expect(accountCell('')).toBeNull();
    expect(accountCell(null)).toBeNull();
    expect(accountCell(undefined)).toBeNull();
  });
});

describe('buildSalesXlsx', () => {
  it('pose deux lignes par famille : HT sur le compte, TVA en dessous', () => {
    const { rows } = buildSalesXlsx([total({})], '2026-05-31');
    // Deux lignes d'écriture + la ligne VENTES.
    expect(rows).toHaveLength(3);
    // Compte principal : le HT, le libellé, le compte de ventes.
    expect(rows[0]).toMatchObject({ label: 'PLANTES 10% PLANTES VERTES', d: null, e: 100, account: 707312 });
    // Compte de TVA, juste en dessous : même libellé, la TVA, le compte de TVA.
    expect(rows[1]).toMatchObject({ label: 'PLANTES 10% PLANTES VERTES', d: null, e: 10, account: 44571 });
  });

  it('numérote la période en colonne C : mois,aa', () => {
    expect(buildSalesXlsx([total({})], '2026-05-31').rows[0]!.marker).toBe(5.26);
    expect(buildSalesXlsx([total({})], '2026-07-31').rows[0]!.marker).toBe(7.26);
    // Un mois à deux chiffres reste lisible : décembre 2026 → 12,26.
    expect(buildSalesXlsx([total({})], '2026-12-31').rows[0]!.marker).toBe(12.26);
  });

  it('date chaque écriture du dernier jour de la période', () => {
    const d = buildSalesXlsx([total({})], '2026-05-31').rows[0]!.date!;
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(4);   // mai = 4
    expect(d.getUTCDate()).toBe(31);
  });

  it('clôt par une ligne VENTES : le CA en D, le compte 13 en F', () => {
    const { rows } = buildSalesXlsx([total({ ttc: 110 }), total({ ttc: 60, ht: 50, tva: 10 })], '2026-05-31');
    const ventes = rows[rows.length - 1]!;
    expect(ventes.label).toBe('VENTES 05,2026');
    expect(ventes.d).toBe(170);   // 110 + 60
    expect(ventes.e).toBeNull();
    expect(ventes.account).toBe(13);
  });

  it('équilibre : total D (CA) = total E (HT + TVA)', () => {
    const { totalD, totalE } = buildSalesXlsx(
      [total({ ht: 100, tva: 10, ttc: 110 }), total({ ht: 50, tva: 10, ttc: 60 })],
      '2026-05-31',
    );
    // D : le seul montant est le CA de la ligne VENTES.
    expect(totalD).toBe(170);
    // E : la somme des HT et des TVA de toutes les familles.
    expect(totalE).toBe(170);
    expect(totalD).toBe(totalE);
  });

  it('laisse la colonne F vide quand aucun compte n\'est paramétré', () => {
    // Fidèle à l'export CSV : on n'invente jamais un numéro de compte.
    const { rows } = buildSalesXlsx(
      [total({ account_code: '', vat_account_code: null, fallback: true })],
      '2026-05-31',
    );
    expect(rows[0]!.account).toBeNull();
    expect(rows[1]!.account).toBeNull();
  });

  it('reproduit fidèlement les montants du modèle', () => {
    // Deux familles du fichier de référence, valeurs calculées incluses.
    const { rows, totalD, totalE } = buildSalesXlsx([
      total({ account_code: '707312', vat_account_code: '44571',
              ht: 6541.79, tva: 654.18, ttc: 7195.97 }),
      total({ account_label: 'BOUGIES 20% PLANTES VERTES',
              account_code: '70762', vat_account_code: '44572',
              ht: 486.34, tva: 97.27, ttc: 583.61, vat_rate: 20 }),
    ], '2026-05-31');
    expect(rows[0]).toMatchObject({ e: 6541.79, account: 707312 });
    expect(rows[1]).toMatchObject({ e: 654.18, account: 44571 });
    expect(rows[2]).toMatchObject({ e: 486.34, account: 70762 });
    expect(rows[3]).toMatchObject({ e: 97.27, account: 44572 });
    expect(totalD).toBe(7779.58);   // 7195.97 + 583.61
    expect(totalE).toBe(7779.58);   // 6541.79 + 654.18 + 486.34 + 97.27
  });
});
