/**
 * Signed URL pour partager la carte fidelite Apple Wallet avec le
 * client sans avoir a s'authentifier. Le token est un JWT court sur
 * la meme clef que la session (SESSION_SECRET) — signature HS256.
 *
 * Contenu : { orgId, customerId, exp }.
 * TTL par defaut : 30 jours. C'est un lien "one-shot" (ou re-cliquable
 * autant qu'on veut jusqu'a expiration), il ne stocke pas d'etat.
 */

import { SignJWT, jwtVerify } from 'jose';

function secretKey(): Uint8Array {
  const k = process.env.SESSION_SECRET;
  if (!k || k.includes('change-me')) {
    throw new Error('SESSION_SECRET non configuré');
  }
  return Buffer.from(k, 'hex');
}

export interface WalletTokenPayload {
  orgId: string;
  customerId: string;
}

const DEFAULT_TTL_SECONDS = 30 * 24 * 3600;

export async function signWalletToken(
  payload: WalletTokenPayload,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  return new SignJWT({ o: payload.orgId, c: payload.customerId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(secretKey());
}

export async function verifyWalletToken(token: string): Promise<WalletTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    if (typeof payload.o !== 'string' || typeof payload.c !== 'string') return null;
    return { orgId: payload.o, customerId: payload.c };
  } catch {
    return null;
  }
}
