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
  MAX_PRESET_AMOUNTS,
  generatePublicKey,
  validateGiftCardCommerceConfig,
  InvalidAmountError,
  looksLikePublicKey,
  isGiftCardAmountAllowed,
  validateReturnPath,
  DEFAULT_SUCCESS_PATH,
  DEFAULT_CANCEL_PATH,
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
    expect(ONLINE_GIFT_CARDS_DEFAULTS.preset_amounts).toEqual([25, 50, 75, 100]);
    expect(ONLINE_GIFT_CARDS_DEFAULTS.allow_custom_amount).toBe(true);
    expect(ONLINE_GIFT_CARDS_DEFAULTS.min_amount).toBe(10);
    expect(ONLINE_GIFT_CARDS_DEFAULTS.max_amount).toBe(500);
  });
});

describe('Configuration commerciale (montants)', () => {
  const base = { preset_amounts: [25, 50, 75, 100], allow_custom_amount: true, min_amount: 10, max_amount: 500 };

  it('accepte une configuration valide et trie les montants', () => {
    const out = validateGiftCardCommerceConfig({ ...base, preset_amounts: [100, 25, 75, 50] });
    expect(out.preset_amounts).toEqual([25, 50, 75, 100]);
    expect(out.min_amount).toBe(10);
    expect(out.max_amount).toBe(500);
  });

  it('rejette les doublons plutôt que de les retirer silencieusement', () => {
    expect(() => validateGiftCardCommerceConfig({ ...base, preset_amounts: [25, 50, 25] }))
      .toThrow(InvalidAmountError);
  });

  it('rejette un montant proposé hors bornes min/max', () => {
    expect(() => validateGiftCardCommerceConfig({ ...base, preset_amounts: [5, 50] }))
      .toThrow(InvalidAmountError);
    expect(() => validateGiftCardCommerceConfig({ ...base, preset_amounts: [50, 600] }))
      .toThrow(InvalidAmountError);
  });

  it('rejette un montant proposé <= 0', () => {
    expect(() => validateGiftCardCommerceConfig({ ...base, preset_amounts: [0, 50] }))
      .toThrow(InvalidAmountError);
    expect(() => validateGiftCardCommerceConfig({ ...base, preset_amounts: [-10, 50] }))
      .toThrow(InvalidAmountError);
  });

  it('exige min_amount > 0', () => {
    expect(() => validateGiftCardCommerceConfig({ ...base, min_amount: 0 })).toThrow(InvalidAmountError);
    expect(() => validateGiftCardCommerceConfig({ ...base, min_amount: -5 })).toThrow(InvalidAmountError);
  });

  it('exige max_amount > min_amount', () => {
    expect(() => validateGiftCardCommerceConfig({ ...base, min_amount: 100, max_amount: 100 }))
      .toThrow(InvalidAmountError);
    expect(() => validateGiftCardCommerceConfig({ ...base, min_amount: 100, max_amount: 50 }))
      .toThrow(InvalidAmountError);
  });

  it('exige un allow_custom_amount strictement booléen', () => {
    expect(() => validateGiftCardCommerceConfig({ ...base, allow_custom_amount: 'oui' as unknown as boolean }))
      .toThrow(InvalidAmountError);
  });

  it('rejette plus de montants que la limite', () => {
    const many = Array.from({ length: MAX_PRESET_AMOUNTS + 1 }, (_, i) => 10 + i);
    expect(() => validateGiftCardCommerceConfig({ ...base, preset_amounts: many, max_amount: 500 }))
      .toThrow(InvalidAmountError);
  });

  it('gère correctement les décimales monétaires (pas de résidu flottant)', () => {
    const out = validateGiftCardCommerceConfig({ ...base, preset_amounts: [25.5, 30.1 + 0.2] });
    // 30.1 + 0.2 vaut 30.299999999999997 en flottant natif : round2 corrige.
    expect(out.preset_amounts).toEqual([25.5, 30.3]);
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

describe('looksLikePublicKey', () => {
  it('accepte une clé bien formée', () => {
    expect(looksLikePublicKey('hp_gc_AAAAAAAAAAAAAAAAAAAA')).toBe(true);
  });
  it('refuse un préfixe différent, une clé trop courte, ou une valeur vide', () => {
    expect(looksLikePublicKey('sk_live_AAAAAAAAAAAAAAAAAAAA')).toBe(false);
    expect(looksLikePublicKey('hp_gc_short')).toBe(false);
    expect(looksLikePublicKey('')).toBe(false);
  });
});

describe('isGiftCardAmountAllowed', () => {
  const cfg = { preset_amounts: [25, 50, 75, 100], allow_custom_amount: true, min_amount: 10, max_amount: 500 };

  it('accepte un montant proposé (preset)', () => {
    expect(isGiftCardAmountAllowed(50, cfg)).toBe(true);
  });

  it('accepte un montant libre dans les bornes si autorisé', () => {
    expect(isGiftCardAmountAllowed(42, cfg)).toBe(true);
    expect(isGiftCardAmountAllowed(10, cfg)).toBe(true);
    expect(isGiftCardAmountAllowed(500, cfg)).toBe(true);
  });

  it('refuse un montant libre hors bornes', () => {
    expect(isGiftCardAmountAllowed(5, cfg)).toBe(false);
    expect(isGiftCardAmountAllowed(600, cfg)).toBe(false);
  });

  it('refuse tout montant hors preset si le montant libre est interdit', () => {
    const strict = { ...cfg, allow_custom_amount: false };
    expect(isGiftCardAmountAllowed(50, strict)).toBe(true); // preset, toujours valide
    expect(isGiftCardAmountAllowed(42, strict)).toBe(false); // hors preset, libre interdit
  });

  it('accepte les décimales cohérentes (ex. 25,50 €)', () => {
    expect(isGiftCardAmountAllowed(25.5, cfg)).toBe(true);
  });

  it('refuse une valeur non numérique ou invalide', () => {
    expect(isGiftCardAmountAllowed(NaN, cfg)).toBe(false);
    expect(isGiftCardAmountAllowed(Infinity, cfg)).toBe(false);
  });
});

describe('validateReturnPath', () => {
  it('renvoie le fallback quand le champ est absent', () => {
    expect(validateReturnPath(undefined, DEFAULT_SUCCESS_PATH)).toBe(DEFAULT_SUCCESS_PATH);
    expect(validateReturnPath(undefined, DEFAULT_CANCEL_PATH)).toBe(DEFAULT_CANCEL_PATH);
  });

  it('accepte un chemin relatif simple', () => {
    expect(validateReturnPath('/carte-cadeau/succes', DEFAULT_SUCCESS_PATH)).toBe('/carte-cadeau/succes');
  });

  it('refuse une URL absolue (tentative de rediriger ailleurs)', () => {
    expect(validateReturnPath('https://site-malicious.com/', DEFAULT_SUCCESS_PATH)).toBeNull();
    expect(validateReturnPath('http://evil.com', DEFAULT_SUCCESS_PATH)).toBeNull();
  });

  it('refuse un chemin protocole-relatif (//evil.com)', () => {
    expect(validateReturnPath('//evil.com', DEFAULT_SUCCESS_PATH)).toBeNull();
  });

  it('refuse un chemin qui ne commence pas par /', () => {
    expect(validateReturnPath('carte-cadeau/succes', DEFAULT_SUCCESS_PATH)).toBeNull();
  });

  it('refuse une requête ou un fragment dans le chemin', () => {
    expect(validateReturnPath('/succes?x=1', DEFAULT_SUCCESS_PATH)).toBeNull();
    expect(validateReturnPath('/succes#top', DEFAULT_SUCCESS_PATH)).toBeNull();
  });

  it('refuse un chemin trop long ou vide', () => {
    expect(validateReturnPath('', DEFAULT_SUCCESS_PATH)).toBeNull();
    expect(validateReturnPath('/' + 'a'.repeat(250), DEFAULT_SUCCESS_PATH)).toBeNull();
  });
});
