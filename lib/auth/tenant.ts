/**
 * Cookie de tenant (organisation) — sépare l'identification du tenant
 * de la session utilisateur.
 *
 * - Posé à la connexion email/password ou à l'issue du setup wizard.
 * - Persiste 30 jours (ré-écriture à chaque login).
 * - Lu par /api/users/select pour ne lister que les utilisateurs du
 *   tenant actuellement choisi sur le poste.
 *
 * Note : la session utilisateur (cookie florea_session) reste prioritaire.
 * Si une session est valide, on prend son organisation_id ; le cookie
 * tenant n'est utilisé qu'en pré-connexion (écran de PIN login).
 */
import { cookies } from 'next/headers';

const TENANT_COOKIE = 'florea_tenant';
const MAX_AGE_S = 60 * 60 * 24 * 30; // 30 jours

export function setTenantCookie(organizationId: string) {
  cookies().set({
    name: TENANT_COOKIE,
    value: organizationId,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_S,
  });
}

export function readTenantCookie(): string | null {
  return cookies().get(TENANT_COOKIE)?.value ?? null;
}

export function clearTenantCookie() {
  cookies().set({
    name: TENANT_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export const TENANT_COOKIE_NAME = TENANT_COOKIE;
