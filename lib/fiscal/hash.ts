import { createHash, createHmac } from 'node:crypto';

export const GENESIS_HASH = '0'.repeat(64);

/**
 * Sérialisation canonique d'un payload pour qu'il soit reproductible :
 * clés triées récursivement, JSON sans espaces.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(obj).sort()) sorted[key] = obj[key];
      return sorted;
    }
    return v;
  });
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Calcule le hash d'un événement fiscal : SHA256( previous_hash | index | event_type | canonical(payload) ).
 * Si une clé de signature est fournie, on signe en HMAC-SHA256 par-dessus pour preuve d'origine éditeur.
 */
export function computeEventHash(args: {
  previousHash: string;
  immutableIndex: bigint | number | string;
  eventType: string;
  payload: unknown;
  signingKey?: string;
}): string {
  const base =
    args.previousHash +
    '|' +
    String(args.immutableIndex) +
    '|' +
    args.eventType +
    '|' +
    canonicalize(args.payload);

  if (args.signingKey && args.signingKey.length > 0) {
    return createHmac('sha256', Buffer.from(args.signingKey, 'hex'))
      .update(base, 'utf8')
      .digest('hex');
  }
  return sha256Hex(base);
}
