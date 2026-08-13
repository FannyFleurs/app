import { describe, it, expect } from 'vitest';
import {
  isDepositReason, ensureDepositReason, depositReasonSql,
  DEPOSIT_LABEL, DEFAULT_DEPOSIT_REASON,
} from '@/lib/services/cash-deposit';

/**
 * Prélèvement (ancienne « remise en banque »).
 *
 * Le geste a été renommé, mais la catégorisation reste par mot-clé dans le
 * motif. On doit reconnaître le NOUVEAU mot (« prélèvement », accentué ou non)
 * ET l'ANCIEN (« banque »), sans quoi les remises déjà enregistrées
 * disparaîtraient du fond de caisse déduit.
 */

describe('Reconnaissance du motif', () => {
  it('reconnaît le nouveau mot, avec ou sans accents', () => {
    expect(isDepositReason('Prélèvement')).toBe(true);
    expect(isDepositReason('prelevement du gérant')).toBe(true);
    expect(isDepositReason('PRÉLÈVEMENT · bordereau 12')).toBe(true);
  });

  it('reconnaît encore l\'ancien mot « banque »', () => {
    // Rétrocompat : les mouvements enregistrés avant le renommage restent
    // comptés comme des prélèvements.
    expect(isDepositReason('Remise en banque')).toBe(true);
    expect(isDepositReason('remise en BANQUE · bordereau')).toBe(true);
  });

  it('ne prend pas un autre motif pour un prélèvement', () => {
    expect(isDepositReason('Fond de caisse apporté')).toBe(false);
    expect(isDepositReason('Erreur de rendu monnaie')).toBe(false);
  });
});

describe('Motif garanti', () => {
  it('laisse un motif déjà reconnu tel quel', () => {
    expect(ensureDepositReason('Prélèvement · bordereau 42')).toBe('Prélèvement · bordereau 42');
    expect(ensureDepositReason('Remise en banque')).toBe('Remise en banque');
  });

  it('préfixe un motif libre pour qu\'il soit reconnu', () => {
    expect(ensureDepositReason('bordereau 42')).toBe('Prélèvement · bordereau 42');
    expect(isDepositReason(ensureDepositReason('coffre'))).toBe(true);
  });

  it('retombe sur le motif par défaut quand rien n\'est saisi', () => {
    expect(ensureDepositReason('  ')).toBe(DEFAULT_DEPOSIT_REASON);
  });
});

describe('Fragment SQL', () => {
  it('couvre banque et les deux graphies de prélèvement', () => {
    const sql = depositReasonSql('cm.reason');
    expect(sql).toContain("cm.reason ILIKE '%banque%'");
    expect(sql).toContain("cm.reason ILIKE '%prél%'");
    expect(sql).toContain("cm.reason ILIKE '%prel%'");
  });
});

describe('Libellé', () => {
  it('est « Prélèvement » partout', () => {
    expect(DEPOSIT_LABEL).toBe('Prélèvement');
    expect(DEFAULT_DEPOSIT_REASON).toBe('Prélèvement');
  });
});
