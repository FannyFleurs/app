import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { revokeSession, SESSION_COOKIE } from '@/lib/auth/session';
import { audit } from '@/lib/audit/log';
import { readSessionFromCookie } from '@/lib/auth/session';
import { SaleService } from '@/lib/services/sale-service';

export async function POST() {
  const user = await readSessionFromCookie();
  // Panier en cours à la déconnexion : on le met en attente (liste partagée),
  // pour qu'il ne revienne pas tout seul dans le panier du prochain utilisateur
  // sur ce poste. La déconnexion prime : une erreur ici ne doit pas la bloquer.
  if (user) {
    try {
      await SaleService.holdOpenDraftsForUser(user.organizationId, user.id);
    } catch {
      /* on continue la déconnexion quoi qu'il arrive */
    }
  }
  const c = cookies().get(SESSION_COOKIE);
  if (c) await revokeSession(c.value);
  cookies().set({
    name: SESSION_COOKIE,
    value: '',
    path: '/',
    maxAge: 0,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  if (user) {
    await audit({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'auth.logout',
      ip: headers().get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: headers().get('user-agent'),
    });
  }
  return NextResponse.json({ ok: true });
}
