import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { query } from '@/lib/db/client';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { SESSION_COOKIE } from '@/lib/auth/session';

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
  const orgRes = await query<{ max_devices: number; name: string }>(
    `SELECT COALESCE(max_devices, 1) AS max_devices, name FROM organizations WHERE id = $1`,
    [params.id],
  );

  // Identifie la session du visiteur (utile pour afficher "(cet appareil)").
  let currentSessionId: string | null = null;
  let viewerOrgName: string | null = null;
  try {
    const cookie = cookies().get(SESSION_COOKIE);
    if (cookie && process.env.SESSION_SECRET) {
      const { payload } = await jwtVerify(
        cookie.value,
        Buffer.from(process.env.SESSION_SECRET, 'hex'),
        { algorithms: ['HS256'] },
      );
      currentSessionId = (payload.jti as string) ?? null;
      const viewerOrgId = payload.org as string | undefined;
      if (viewerOrgId && viewerOrgId !== params.id) {
        const vo = await query<{ name: string }>(
          `SELECT name FROM organizations WHERE id = $1`, [viewerOrgId],
        );
        viewerOrgName = vo.rows[0]?.name ?? null;
      }
    }
  } catch { /* cookie absent ou JWT invalide */ }

  return NextResponse.json({
    sessions: rows,
    max_devices: Number(orgRes.rows[0]?.max_devices ?? 1),
    organization_name: orgRes.rows[0]?.name ?? null,
    current_session_id: currentSessionId,
    viewer_in_other_org: viewerOrgName,
  });
}
