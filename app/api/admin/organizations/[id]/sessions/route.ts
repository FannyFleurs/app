import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requireSuperAdmin } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/**
 * Liste les sessions actives (= non révoquées et non expirées) de
 * l'organisation, avec utilisateur, IP et user-agent. Sert dans la
 * console admin SaaS pour libérer manuellement une « place » lorsque
 * le client a atteint sa limite multi-appareils.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requireSuperAdmin();
  if ('response' in g) return g.response;

  const { rows } = await query<{
    id: string;
    user_id: string;
    user_email: string;
    user_full_name: string;
    ip: string | null;
    user_agent: string | null;
    created_at: string;
    expires_at: string;
  }>(
    `SELECT s.id, s.user_id, u.email AS user_email, u.full_name AS user_full_name,
            s.ip, s.user_agent, s.created_at, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE u.organization_id = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
      ORDER BY s.created_at DESC`,
    [params.id],
  );

  // Compte aussi la limite multi-appareils pour permettre l'affichage
  // "3 / 5 appareils utilisés".
  const orgRes = await query<{ max_devices: number }>(
    `SELECT COALESCE(max_devices, 1) AS max_devices FROM organizations WHERE id = $1`,
    [params.id],
  );

  return NextResponse.json({
    sessions: rows,
    max_devices: Number(orgRes.rows[0]?.max_devices ?? 1),
  });
}
