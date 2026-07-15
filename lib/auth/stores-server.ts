import 'server-only';
import { query } from '@/lib/db/client';
import type { AuthUser } from './session';

/**
 * Boutiques visibles par l'utilisateur (même politique que /api/me) : les
 * rôles privilégiés (super_admin, owner, manager) voient toutes les boutiques
 * actives ; les autres uniquement celles auxquelles ils sont rattachés
 * (user_store_access), ou toutes s'ils n'ont aucun rattachement explicite.
 */
export async function accessibleStores(
  user: Pick<AuthUser, 'id' | 'organizationId' | 'role'>,
): Promise<{ id: string; name: string }[]> {
  const { rows } = await query<{ id: string; name: string }>(
    `SELECT s.id, s.name FROM stores s
      WHERE s.organization_id = $2
        AND s.is_active = TRUE
        AND (
          $3 IN ('super_admin','owner','manager')
          OR NOT EXISTS (SELECT 1 FROM user_store_access WHERE user_id = $1)
          OR EXISTS (SELECT 1 FROM user_store_access
                      WHERE user_id = $1 AND store_id = s.id)
        )
      ORDER BY s.name`,
    [user.id, user.organizationId, user.role],
  );
  return rows;
}

/** Vérifie qu'une boutique appartient bien à l'organisation. */
export async function storeInOrg(storeId: string, organizationId: string): Promise<boolean> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM stores WHERE id = $1 AND organization_id = $2`,
    [storeId, organizationId],
  );
  return rows.length > 0;
}
