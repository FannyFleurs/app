import { NextResponse } from 'next/server';
import { readSessionFromCookie, type AuthUser } from './session';
import { hasPermission, type Permission } from './rbac';
import { hasEffectivePermission } from './permissions';

/**
 * À utiliser dans les API routes : renvoie soit { user }, soit une Response 401/403.
 */
export async function requireSession(): Promise<
  { user: AuthUser } | { response: NextResponse }
> {
  const user = await readSessionFromCookie();
  if (!user) {
    return {
      response: NextResponse.json(
        { error: 'UNAUTHENTICATED' },
        { status: 401 },
      ),
    };
  }
  return { user };
}

export async function requirePermission(
  permission: Permission,
): Promise<{ user: AuthUser } | { response: NextResponse }> {
  const r = await requireSession();
  if ('response' in r) return r;
  // hasEffectivePermission combine déjà : défauts du rôle + overrides
  // org-level + overrides user-level. Si la migration 0017 n'est pas
  // appliquée, on tombe gracieusement sur les défauts seuls.
  const ok = await hasEffectivePermission(
    r.user.id, r.user.role, r.user.organizationId, permission,
  );
  if (!ok) {
    return {
      response: NextResponse.json(
        { error: 'FORBIDDEN', permission },
        { status: 403 },
      ),
    };
  }
  return { user: r.user };
}

/**
 * Garde réservée aux opérateurs SaaS de Webpos (super_admin).
 * Permet d'accéder aux endpoints cross-tenant (/admin/*).
 */
export async function requireSuperAdmin(): Promise<
  { user: AuthUser } | { response: NextResponse }
> {
  const r = await requireSession();
  if ('response' in r) return r;
  if (r.user.role !== 'super_admin') {
    return {
      response: NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }),
    };
  }
  return { user: r.user };
}
