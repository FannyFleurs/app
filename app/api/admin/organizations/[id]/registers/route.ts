import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requireSuperAdmin } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/**
 * Liste les caisses (registers) de l'organisation avec leur liaison
 * poste (device). Sert dans la console super-admin pour voir les postes
 * actifs et pouvoir les libérer à distance (« 1 poste = 1 caisse »).
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requireSuperAdmin();
  if ('response' in g) return g.response;

  try {
    const { rows } = await query<{
      id: string; code: string; name: string; is_active: boolean;
      store_name: string;
      device_id: string | null; device_name: string | null; bound_at: string | null;
    }>(
      `SELECT r.id, r.code, r.name, r.is_active,
              s.name AS store_name,
              r.device_id, r.device_name, r.bound_at
         FROM registers r
         JOIN stores s ON s.id = r.store_id
        WHERE r.organization_id = $1
        ORDER BY s.name, r.name`,
      [params.id],
    );
    return NextResponse.json({ registers: rows });
  } catch {
    // Migration 0026 (device binding) pas encore appliquee.
    return NextResponse.json({ registers: [], migration_required: '0026_register_device_binding' });
  }
}
