import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  encryptSecret, decryptSecret, isEncryptedSecret, isEncryptionConfigured,
  SecretCryptoError,
} from '@/lib/security/secret-crypto';

/**
 * Chiffrement applicatif des secrets (Stripe par boutique — voir
 * lib/security/secret-crypto.ts). Aucune dépendance ajoutée (node:crypto).
 */

const VALID_KEY = 'a'.repeat(64); // 64 hex chars = 256 bits, clé de test uniquement
const originalEnv = process.env.SECRETS_ENCRYPTION_KEY;

function setKey(v: string | undefined) {
  if (v === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
  else process.env.SECRETS_ENCRYPTION_KEY = v;
}

afterEach(() => { setKey(originalEnv); });

describe('Sans clé configurée (SECRETS_ENCRYPTION_KEY absente)', () => {
  beforeEach(() => setKey(undefined));

  it('isEncryptionConfigured() renvoie false', () => {
    expect(isEncryptionConfigured()).toBe(false);
  });

  it('encryptSecret renvoie la valeur EN CLAIR, inchangée (zéro régression avant déploiement de la variable)', () => {
    expect(encryptSecret('sk_live_abcdef123456')).toBe('sk_live_abcdef123456');
  });

  it('decryptSecret renvoie une valeur en clair (legacy) telle quelle', () => {
    expect(decryptSecret('sk_live_abcdef123456')).toBe('sk_live_abcdef123456');
  });

  it('decryptSecret lève si la valeur est au format chiffré mais la clé est absente', () => {
    setKey(VALID_KEY);
    const enc = encryptSecret('sk_live_abcdef123456');
    setKey(undefined);
    expect(() => decryptSecret(enc)).toThrow(SecretCryptoError);
  });

  it('une chaîne vide reste une chaîne vide (représente "non configuré")', () => {
    expect(encryptSecret('')).toBe('');
  });
});

describe('Avec clé configurée', () => {
  beforeEach(() => setKey(VALID_KEY));

  it('isEncryptionConfigured() renvoie true', () => {
    expect(isEncryptionConfigured()).toBe(true);
  });

  it('chiffre puis déchiffre correctement (round-trip)', () => {
    const secret = 'test-secret-value-do-not-use-in-prod-1234567890';
    const enc = encryptSecret(secret);
    expect(enc).not.toBe(secret);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it('le format est versionné et reconnaissable (isEncryptedSecret)', () => {
    const enc = encryptSecret('whsec_test123');
    expect(enc.startsWith('enc:v1:')).toBe(true);
    expect(isEncryptedSecret(enc)).toBe(true);
    expect(isEncryptedSecret('sk_live_plaintext')).toBe(false);
  });

  it('deux chiffrements de la même valeur donnent des ciphertexts différents (IV aléatoire, jamais réutilisé)', () => {
    const a = encryptSecret('sk_live_same_value');
    const b = encryptSecret('sk_live_same_value');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('sk_live_same_value');
    expect(decryptSecret(b)).toBe('sk_live_same_value');
  });

  it('déchiffre correctement une valeur EN CLAIR héritée (tolérance à la migration progressive)', () => {
    expect(decryptSecret('sk_live_old_plaintext_value')).toBe('sk_live_old_plaintext_value');
  });

  it('une chaîne vide reste une chaîne vide', () => {
    expect(encryptSecret('')).toBe('');
    expect(decryptSecret('')).toBe('');
  });

  it('lève une erreur explicite si le ciphertext est corrompu/tronqué (authentification GCM)', () => {
    const enc = encryptSecret('sk_live_abcdef123456');
    const corrupted = enc.slice(0, -4) + 'AAAA';
    expect(() => decryptSecret(corrupted)).toThrow(SecretCryptoError);
  });

  it('lève une erreur explicite si déchiffré avec la MAUVAISE clé', () => {
    const enc = encryptSecret('sk_live_abcdef123456');
    setKey('b'.repeat(64));
    expect(() => decryptSecret(enc)).toThrow(SecretCryptoError);
  });

  it("l'erreur ne contient jamais le secret en clair ni la clé maître", () => {
    const enc = encryptSecret('sk_live_super_secret_value');
    setKey('b'.repeat(64));
    try {
      decryptSecret(enc);
      throw new Error('devrait avoir levé');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).not.toContain('sk_live_super_secret_value');
      expect(message).not.toContain('a'.repeat(64));
      expect(message).not.toContain('b'.repeat(64));
    }
  });

  it('rejette une clé mal formée (pas 64 caractères hex) avec un message explicite', () => {
    setKey('trop-courte');
    expect(() => encryptSecret('sk_live_x')).toThrow(SecretCryptoError);
  });

  it('gère correctement les caractères UTF-8 (accents) dans le secret', () => {
    const enc = encryptSecret('clé-avec-accents-éèà');
    expect(decryptSecret(enc)).toBe('clé-avec-accents-éèà');
  });
});
