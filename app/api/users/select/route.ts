import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

/**
 * Liste publique des utilisateurs actifs (pour l'écran de connexion par tuile).
 * On ne renvoie ni email ni hash — uniquement id, full_name, role et organization_id.
 */
export async function GET() {
  const { rows } = await query<{
    id: string; full_name: string; role: string;
    has_pin: boolean;
  }>(
    `SELECT id, full_name, role, (pin_code_hash IS NOT NULL) AS has_pin
       FROM users
      WHERE is_active = TRUE
      ORDER BY full_name`,
  );
  return NextResponse.json({ users: rows });
}
