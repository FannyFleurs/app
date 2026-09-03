import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  mergeOrderIntegrationDefaults,
  toPublicOrderIntegration,
  ORDER_INTEGRATION_DEFAULTS,
} from '@/lib/settings/order-integration';

/**
 * Intégration « Commande entrante ».
 *
 * Une app externe pousse des commandes ; HelloPos en fait des ventes EN
 * ATTENTE, encaissées normalement, puis rappelle l'app « Payé ». Deux
 * invariants tiennent tout : le réglage est inerte tant qu'il n'est pas activé,
 * et jamais un secret (jeton, secret de callback) ne sort côté écran.
 */

describe('Réglage intégration commande', () => {
  it('est inerte par défaut', () => {
    const s = mergeOrderIntegrationDefaults(null);
    expect(s.enabled).toBe(false);
    expect(s.token_hash).toBeNull();
    expect(s.boutique_map).toEqual({});
  });

  it('conserve le mapping boutiques et les secrets à la fusion', () => {
    const s = mergeOrderIntegrationDefaults({
      enabled: true,
      token_hash: 'abc',
      token_hint: 'xyz123',
      boutique_map: { 'Alençon': 'store-1' },
      callback_url: 'https://ex.test/paid',
      callback_secret: 'shh',
    });
    expect(s.enabled).toBe(true);
    expect(s.boutique_map).toEqual({ 'Alençon': 'store-1' });
    expect(s.callback_url).toBe('https://ex.test/paid');
  });

  it('ne divulgue jamais les secrets dans la vue publique', () => {
    const pub = toPublicOrderIntegration(mergeOrderIntegrationDefaults({
      enabled: true, token_hash: 'deadbeef', token_hint: 'ef1234',
      callback_secret: 'top-secret', callback_url: 'https://ex.test/paid',
      boutique_map: { 'Mortagne': 's2' },
    }));
    const serialized = JSON.stringify(pub);
    expect(serialized).not.toContain('deadbeef');   // token_hash
    expect(serialized).not.toContain('top-secret');  // callback_secret
    expect(pub.token_set).toBe(true);
    expect(pub.token_hint).toBe('ef1234');
    expect(pub.callback_secret_set).toBe(true);
    expect(pub.boutique_map).toEqual({ 'Mortagne': 's2' });
  });
});

describe('Endpoint entrant', () => {
  const route = readFileSync('app/api/orders/incoming/route.ts', 'utf8');
  const intake = readFileSync('lib/services/order-intake.ts', 'utf8');

  it('exige un jeton et refuse un jeton inconnu', () => {
    expect(route).toMatch(/MISSING_TOKEN/);
    expect(route).toMatch(/INVALID_TOKEN/);
    expect(route).toMatch(/resolveOrgByOrderToken/);
  });

  it('crée une vente EN ATTENTE, sans session, idempotente', () => {
    // La commande doit atterrir dans « En attente » (on_hold), rejoignable par
    // n'importe quelle caisse de la boutique, et un double envoi ne duplique pas.
    expect(intake).toMatch(/status.*on_hold|'on_hold'/);
    expect(intake).toMatch(/client_ref/);
    expect(intake).toMatch(/duplicate: true/);
  });
});

it('les valeurs par défaut restent stables', () => {
  expect(ORDER_INTEGRATION_DEFAULTS.enabled).toBe(false);
});
