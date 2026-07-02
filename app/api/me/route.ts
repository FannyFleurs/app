import { NextResponse } from 'next/server';
import { readSessionFromCookie } from '@/lib/auth/session';
import { query } from '@/lib/db/client';

export async function GET() {
  const user = await readSessionFromCookie();
  if (!user) return NextResponse.json({ user: null }, { status: 200 });
  // Politique d'acces : voir commentaire dans app/(app)/caisse/page.tsx.
  const stores = await query<{ id: string; code: string; name: string }>(
    `SELECT s.id, s.code, s.name FROM stores s
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
  const registers = await query<{ id: string; store_id: string; code: string; name: string }>(
    `SELECT id, store_id, code, name FROM registers
      WHERE organization_id = $1 AND is_active = TRUE
      ORDER BY name`,
    [user.organizationId],
  );
  return NextResponse.json({ user, stores: stores.rows, registers: registers.rows });
}
