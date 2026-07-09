import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requireSuperAdmin } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/** Liste des utilisateurs d'une organisation (console super-admin). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requireSuperAdmin();
  if ('response' in g) return g.response;
  const { rows } = await query<{
    id: string; full_name: string; email: string; role: string;
    is_active: boolean; has_password: boolean;
  }>(
    `SELECT id, full_name, email, role, is_active,
            (password_hash IS NOT NULL) AS has_password
       FROM users WHERE organization_id = $1 ORDER BY role, full_name`,
    [params.id],
  );
  return NextResponse.json({ users: rows });
}
