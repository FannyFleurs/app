import { describe, it, expect } from 'vitest';
import { canonicalize, computeEventHash, GENESIS_HASH, sha256Hex } from '../lib/fiscal/hash';

describe('canonicalize', () => {
  it('produit la même sortie quel que soit l\'ordre des clés', () => {
    const a = canonicalize({ b: 1, a: 2, c: { y: 1, x: 2 } });
    const b = canonicalize({ a: 2, b: 1, c: { x: 2, y: 1 } });
    expect(a).toBe(b);
  });
  it('conserve l\'ordre des tableaux', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
  });
});

describe('computeEventHash', () => {
  it('génère un hash reproductible et dépend du previous_hash', () => {
    const h1 = computeEventHash({
      previousHash: GENESIS_HASH, immutableIndex: 1,
      eventType: 'SALE_VALIDATED', payload: { sale: '1', total: 12.34 },
    });
    const h2 = computeEventHash({
      previousHash: GENESIS_HASH, immutableIndex: 1,
      eventType: 'SALE_VALIDATED', payload: { total: 12.34, sale: '1' },
    });
    expect(h1).toBe(h2);

    const h3 = computeEventHash({
      previousHash: 'a'.repeat(64), immutableIndex: 1,
      eventType: 'SALE_VALIDATED', payload: { sale: '1', total: 12.34 },
    });
    expect(h3).not.toBe(h1);
  });

  it('change si on modifie le moindre champ du payload', () => {
    const h1 = computeEventHash({
      previousHash: GENESIS_HASH, immutableIndex: 1,
      eventType: 'X', payload: { a: 1 },
    });
    const h2 = computeEventHash({
      previousHash: GENESIS_HASH, immutableIndex: 1,
      eventType: 'X', payload: { a: 2 },
    });
    expect(h1).not.toBe(h2);
  });

  it('génère un hash signé HMAC différent quand une clé est fournie', () => {
    const key = '0'.repeat(64);
    const plain = computeEventHash({
      previousHash: GENESIS_HASH, immutableIndex: 1, eventType: 'X', payload: { a: 1 },
    });
    const signed = computeEventHash({
      previousHash: GENESIS_HASH, immutableIndex: 1, eventType: 'X', payload: { a: 1 },
      signingKey: key,
    });
    expect(plain).not.toBe(signed);
    expect(signed).toHaveLength(64);
  });
});

describe('sha256Hex', () => {
  it('renvoie une chaîne hex de 64 caractères', () => {
    expect(sha256Hex('hello')).toHaveLength(64);
  });
});
