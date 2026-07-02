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
 * Si aucun des deux n'est présent, on renvoie une liste vide avec
 * `tenant_required: true` pour que la page de login affiche d'abord
 * l'écran « Accès admin » / « Créer une boutique ».
 */
export async function GET() {
  const session = await readSessionFromCookie();
  const tenantId = session?.organizationId ?? readTenantCookie();
  if (!tenantId) {
    return NextResponse.json({ users: [], tenant_required: true });
  }

  try {
    const { rows } = await query<{
      id: string; full_name: string; role: string;
      has_pin: boolean; pin_required: boolean; color: string | null;
    }>(
      `SELECT id, full_name, role,
              (pin_code_hash IS NOT NULL) AS has_pin,
              COALESCE(pin_required, TRUE) AS pin_required,
              color
         FROM users
        WHERE is_active = TRUE
          AND organization_id = $1
        ORDER BY full_name`,
      [tenantId],
    );
    return NextResponse.json({ users: rows, tenant_id: tenantId });
  } catch (err) {
    const m = (err as Error).message ?? '';
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
    if (m.includes('column "color"') || m.includes('"users".color')) {
      // Migration 0022 pas encore appliquee : on renvoie sans color.
      const { rows } = await query(
        `SELECT id, full_name, role,
                (pin_code_hash IS NOT NULL) AS has_pin,
                COALESCE(pin_required, TRUE) AS pin_required
           FROM users
          WHERE is_active = TRUE AND organization_id = $1
          ORDER BY full_name`,
        [tenantId],
      );
      return NextResponse.json({ users: rows, tenant_id: tenantId });
    }
    // eslint-disable-next-line no-console
    console.error('[users.select]', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: m },
      { status: 500 },
    );
  }
}
