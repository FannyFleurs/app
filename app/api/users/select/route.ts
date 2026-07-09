import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { readSessionFromCookie } from '@/lib/auth/session';
import { readTenantCookie } from '@/lib/auth/tenant';

export const dynamic = 'force-dynamic';

/**
 * Liste des utilisateurs actifs pour l'écran de connexion par tuile.
 *
 * Multi-tenant : on filtre par organisation. L'organisation est déterminée
 * par (dans l'ordre) :
 *   1. la session active (priorité haute, déjà connecté)
 *   2. le cookie tenant (posé à la connexion email/password ou au setup)
 *
 * Multi-boutiques : si le poste est lié à une caisse (device_id en
 * localStorage, envoyé en query), on résout la boutique de ce poste et
 * on ne montre QUE les utilisateurs rattachés à cette boutique. Un
 * utilisateur sans aucun rattachement (user_store_access vide) reste
 * visible partout — utile pour un admin global / la rétrocompat.
 *
 * Si aucun tenant n'est présent, on renvoie une liste vide avec
 * `tenant_required: true`.
 */
export async function GET(req: Request) {
  const session = await readSessionFromCookie();
  const tenantId = session?.organizationId ?? readTenantCookie();
  if (!tenantId) {
    return NextResponse.json({ users: [], tenant_required: true });
  }

  // Résout la boutique du poste à partir du device_id (caisse liée).
  const url = new URL(req.url);
  const deviceId = url.searchParams.get('device_id');
  let storeId: string | null = null;
  if (deviceId) {
    try {
      const reg = await query<{ store_id: string }>(
        `SELECT store_id FROM registers
          WHERE organization_id = $1 AND device_id = $2 AND is_active = TRUE
          LIMIT 1`,
        [tenantId, deviceId],
      );
      storeId = reg.rows[0]?.store_id ?? null;
    } catch {
      // Migration 0026 (device_id) pas appliquee : on ignore le filtre.
      storeId = null;
    }
  }

  // Filtre boutique : soit l'utilisateur a explicitement acces a cette
  // boutique, soit il n'a AUCUN rattachement (acces global / admin).
  const storeFilter = storeId
    ? `AND (
         EXISTS (SELECT 1 FROM user_store_access usa
                  WHERE usa.user_id = u.id AND usa.store_id = $2)
         OR NOT EXISTS (SELECT 1 FROM user_store_access usa
                         WHERE usa.user_id = u.id)
       )`
    : '';
  const storeParams = storeId ? [tenantId, storeId] : [tenantId];

  try {
    const { rows } = await query<{
      id: string; full_name: string; role: string;
      has_pin: boolean; pin_required: boolean; color: string | null;
    }>(
      `SELECT u.id, u.full_name, u.role,
              (u.pin_code_hash IS NOT NULL) AS has_pin,
              COALESCE(u.pin_required, TRUE) AS pin_required,
              u.color
         FROM users u
        WHERE u.is_active = TRUE
          AND u.organization_id = $1
          ${storeFilter}
        ORDER BY u.full_name`,
      storeParams,
    );
    return NextResponse.json({ users: rows, tenant_id: tenantId, store_id: storeId });
  } catch (err) {
    const m = (err as Error).message ?? '';
    // Fallback sans color (migration 0022 absente) — on garde le filtre boutique.
    if (m.includes('column "color"') || m.includes('"users".color')) {
      const { rows } = await query(
        `SELECT u.id, u.full_name, u.role,
                (u.pin_code_hash IS NOT NULL) AS has_pin,
                COALESCE(u.pin_required, TRUE) AS pin_required
           FROM users u
          WHERE u.is_active = TRUE AND u.organization_id = $1
            ${storeFilter}
          ORDER BY u.full_name`,
        storeParams,
      );
      return NextResponse.json({ users: rows, tenant_id: tenantId, store_id: storeId });
    }
    if (m.includes('pin_code_hash')) {
      const { rows } = await query(
        `SELECT id, full_name, role, FALSE AS has_pin, TRUE AS pin_required
           FROM users
          WHERE is_active = TRUE AND organization_id = $1
          ORDER BY full_name`,
        [tenantId],
      );
      return NextResponse.json({
        users: rows,
        tenant_id: tenantId,
        migration_required: '0007_user_pin_and_settings',
      });
    }
    if (m.includes('pin_required')) {
      const { rows } = await query(
        `SELECT id, full_name, role,
                (pin_code_hash IS NOT NULL) AS has_pin,
                TRUE AS pin_required
           FROM users
          WHERE is_active = TRUE AND organization_id = $1
          ORDER BY full_name`,
        [tenantId],
      );
      return NextResponse.json({
        users: rows,
        tenant_id: tenantId,
        migration_required: '0009_user_pin_optional',
      });
    }
    // eslint-disable-next-line no-console
    console.error('[users.select]', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: m },
      { status: 500 },
    );
  }
}
