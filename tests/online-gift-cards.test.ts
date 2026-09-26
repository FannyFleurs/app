import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  mergeOnlineGiftCardsDefaults,
  normalizeOrigin,
  normalizeOrigins,
  isValidOrigin,
  InvalidOriginError,
  ONLINE_GIFT_CARDS_DEFAULTS,
  MAX_ALLOWED_ORIGINS,
  generatePublicKey,
} from '@/lib/settings/online-gift-cards';

/**
 * Configuration « Cartes cadeaux en ligne » (étape 1 : pas de vente publique,
 * pas de Stripe, pas de webhook — seulement la configuration de l'intégration).
 */

describe('Réglage cartes cadeaux en ligne', () => {
  it('est inerte par défaut', () => {
    const s = mergeOnlineGiftCardsDefaults(null);
    expect(s.enabled).toBe(false);
    expect(s.public_key).toBe('');
    expect(s.allowed_origins).toEqual([]);
  });

  it('conserve les champs à la fusion', () => {
    const s = mergeOnlineGiftCardsDefaults({
      enabled: true,
      public_key: 'hp_gc_abc123',
      allowed_origins: ['https://fanny-fleurs.com'],
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(s.enabled).toBe(true);
    expect(s.public_key).toBe('hp_gc_abc123');
    expect(s.allowed_origins).toEqual(['https://fanny-fleurs.com']);
  });

  it('les valeurs par défaut restent stables', () => {
    expect(ONLINE_GIFT_CARDS_DEFAULTS.enabled).toBe(false);
  });
});

describe('Génération de la clé publique', () => {
  it('suit le format hp_gc_<aléatoire>', () => {
    const key = generatePublicKey();
    expect(key).toMatch(/^hp_gc_[A-Za-z0-9_-]{20,}$/);
  });

  it('est unique à chaque génération (non séquentielle)', () => {
    const keys = new Set(Array.from({ length: 200 }, () => generatePublicKey()));
    expect(keys.size).toBe(200);
  });

  it("n'est pas dérivée d'un UUID d'organisation ni prévisible", () => {
    const a = generatePublicKey();
    const b = generatePublicKey();
    // Deux clés générées à la suite ne doivent partager aucun suffixe commun
    // trivial (aléatoire, pas un compteur ni un timestamp).
    expect(a).not.toBe(b);
    expect(a.slice(-6)).not.toBe(b.slice(-6));
  });
});

describe('Validation des domaines autorisés', () => {
  it('accepte des origines https valides et les normalise sans slash final', () => {
    expect(normalizeOrigin('https://fanny-fleurs.com')).toBe('https://fanny-fleurs.com');
    expect(normalizeOrigin('https://fanny-fleurs.com/')).toBe('https://fanny-fleurs.com');
    expect(normalizeOrigin('https://www.fanny-fleurs.com')).toBe('https://www.fanny-fleurs.com');
    expect(normalizeOrigin('  https://fanny-fleurs.com  ')).toBe('https://fanny-fleurs.com');
  });

  it('accepte localhost en http (développement), refuse http ailleurs', () => {
    expect(normalizeOrigin('http://localhost:3000')).toBe('http://localhost:3000');
    expect(isValidOrigin('http://fanny-fleurs.com')).toBe(false);
  });

  it('refuse les protocoles dangereux', () => {
    expect(isValidOrigin('javascript:alert(1)')).toBe(false);
    expect(isValidOrigin('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('refuse un chemin, une requête ou un fragment (ce doit être une origine, pas une URL)', () => {
    expect(isValidOrigin('https://fanny-fleurs.com/boutique')).toBe(false);
    expect(isValidOrigin('https://fanny-fleurs.com?x=1')).toBe(false);
    expect(isValidOrigin('https://fanny-fleurs.com#top')).toBe(false);
  });

  it('refuse une valeur manifestement invalide', () => {
    expect(isValidOrigin('')).toBe(false);
    expect(isValidOrigin('pas une url')).toBe(false);
    expect(isValidOrigin('ftp://fanny-fleurs.com')).toBe(false);
  });

  it('normalizeOrigins déduplique et lève sur la première valeur invalide', () => {
    const out = normalizeOrigins([
      'https://fanny-fleurs.com', 'https://fanny-fleurs.com/', 'https://www.fanny-fleurs.com',
    ]);
    expect(out).toEqual(['https://fanny-fleurs.com', 'https://www.fanny-fleurs.com']);

    expect(() => normalizeOrigins(['https://ok.com', 'javascript:evil()']))
      .toThrow(InvalidOriginError);
  });

  it('refuse plus de domaines que la limite', () => {
    const many = Array.from({ length: MAX_ALLOWED_ORIGINS + 1 }, (_, i) => `https://site-${i}.com`);
    expect(() => normalizeOrigins(many)).toThrow();
  });
});

describe('Isolation multi-tenant', () => {
  const settingsRoute = readFileSync('app/api/settings/online-gift-cards/route.ts', 'utf8');
  const regenerateRoute = readFileSync('app/api/settings/online-gift-cards/regenerate/route.ts', 'utf8');

  it("n'utilise que l'organisation de la session — jamais un organization_id venu du client", () => {
    for (const route of [settingsRoute, regenerateRoute]) {
      expect(route).toMatch(/requirePermission\('settings\.(read|write)'\)/);
      expect(route).toMatch(/g\.user\.organizationId/);
      // Le corps de requête ne doit jamais fournir organization_id.
      expect(route).not.toMatch(/organization_id:\s*(req|body|d|parsed)\./);
    }
  });

  it('la lecture exige settings.read et la modification settings.write', () => {
    expect(settingsRoute).toMatch(/requirePermission\('settings\.read'\)/);
    expect(settingsRoute).toMatch(/requirePermission\('settings\.write'\)/);
    expect(regenerateRoute).toMatch(/requirePermission\('settings\.write'\)/);
  });
});
