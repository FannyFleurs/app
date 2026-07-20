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
  let tenantId = session?.organizationId ?? readTenantCookie();
  // Repli mono-organisation : sur un déploiement à une seule organisation
  // (cas courant d'un client), on n'exige pas de cookie tenant préalable.
  // Indispensable pour se connecter directement sur des sous-domaines
  // secondaires (print., ca.…) sans passer d'abord par la caisse.
  // Sur un déploiement multi-tenant (plusieurs organisations), on garde
  // l'exigence du tenant pour préserver l'isolation.
  if (!tenantId) {
    try {
      const orgs = await query<{ id: string }>(`SELECT id FROM organizations LIMIT 2`);
      if (orgs.rowCount === 1) tenantId = orgs.rows[0]!.id;
    } catch { /* ignore */ }
  }
  if (!tenantId) {
    return NextResponse.json({ users: [], tenant_required: true });
  }

  // Résout la boutique du poste à partir du device_id (caisse liée).
  const url = new URL(req.url);
  const deviceId = url.searchParams.get('device_id');
  let storeId: string | null = null;
  // Sur la station d'étiquettes (PDA), l'appareil n'est pas une caisse mais une
  // label_station : on résout aussi la boutique via ce rattachement pour
  // filtrer les utilisateurs proposés.
  if (deviceId) {
    try {
      const reg = await query<{ store_id: string }>(
        `SELECT store_id FROM registers
          WHERE organization_id = $1 AND device_id = $2 AND is_active = TRUE
          LIMIT 1`,
        [tenantId, deviceId],
      );
      storeId = reg.rows[0]?.store_id ?? null;
      if (!storeId) {
        try {
          const ls = await query<{ store_id: string }>(
            `SELECT store_id FROM label_stations
              WHERE organization_id = $1 AND device_id = $2 LIMIT 1`,
            [tenantId, deviceId],
          );
          storeId = ls.rows[0]?.store_id ?? null;
        } catch { /* table 0051 absente */ }
      }
    } catch {
      // Migration 0026 (device_id) pas appliquee : on ignore le filtre.
      storeId = null;
    }
  }

  // Filtre boutique. Un utilisateur est visible sur ce poste si :
  //  - il a un rôle de gestion (admin/responsable) : accès à TOUTES les
  //    boutiques, jamais restreint ;
  //  - OU il a explicitement accès à cette boutique ;
  //  - OU il n'a aucun rattachement (accès global / rétrocompat).
  const storeFilter = storeId
    ? `AND (
         u.role IN ('super_admin','owner','manager')
         OR EXISTS (SELECT 1 FROM user_store_access usa
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
