import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, renewSessionFromToken } from '@/lib/auth/session';

/**
 * Renouvellement glissant de la session. Appelé périodiquement par le client
 * (SessionKeepAlive) tant que l'appareil est ouvert : prolonge la session en
 * base et repose un cookie frais. Un appareil réellement utilisé ne se
 * déconnecte donc jamais. Ne crée jamais de nouvelle session (pas d'impact sur
 * la limite multi-appareils).
 */
export async function POST() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ ok: false }, { status: 401 });

  const renewed = await renewSessionFromToken(token);
  if (!renewed) return NextResponse.json({ ok: false }, { status: 401 });

  cookies().set(renewed.cookie);
  return NextResponse.json({ ok: true });
}
