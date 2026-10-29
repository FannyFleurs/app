import { describe, it, expect } from 'vitest';
import { PAYMENT_TERMS, paymentTerm, paymentTermLabel, computeDueDate } from '@/lib/settings/payment-terms';

/**
 * Condition de règlement "Chorus Pro" (facturation du secteur public,
 * obligatoire pour ces organismes), sélectionnable par client comme les
 * autres conditions (voir CustomerFormModal / InvoicingSettingsForm, qui
 * listent toutes PAYMENT_TERMS sans rien de spécifique à coder).
 */
describe('Condition de règlement "Chorus Pro"', () => {
  it('est listée parmi les conditions disponibles, avec une échéance de 30 jours', () => {
    const term = paymentTerm('chorus_pro');
    expect(term).not.toBeNull();
    expect(term?.days).toBe(30);
    expect(PAYMENT_TERMS.some((t) => t.code === 'chorus_pro')).toBe(true);
  });

  it('affiche un libellé explicite sur la facture', () => {
    expect(paymentTermLabel('chorus_pro')).toMatch(/Chorus Pro/);
  });

  it('calcule une échéance à 30 jours de la date d\'émission', () => {
    expect(computeDueDate('2026-01-01', 'chorus_pro')).toBe('2026-01-31');
  });
});
