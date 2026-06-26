import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

/**
 * Liste publique des utilisateurs actifs pour l'écran de connexion par tuile.
 * Robuste : si la migration 0007 n'a pas encore créé pin_code_hash, on retombe
 * sur un SELECT sans cette colonne (has_pin renvoyé à false).
 */
export async function GET() {
  try {
    const { rows } = await query<{
      id: string; full_name: string; role: string; has_pin: boolean;
    }>(
      `SELECT id, full_name, role, (pin_code_hash IS NOT NULL) AS has_pin
         FROM users
        WHERE is_active = TRUE
        ORDER BY full_name`,
    );
    return NextResponse.json({ users: rows });
  } catch (err) {
    const m = (err as Error).message ?? '';
    if (m.includes('pin_code_hash')) {
      // Migration 0007 pas encore appliquée — fallback sans PIN
      const { rows } = await query(
        `SELECT id, full_name, role, FALSE AS has_pin
           FROM users
          WHERE is_active = TRUE
          ORDER BY full_name`,
      );
      return NextResponse.json({
        users: rows,
        migration_required: '0007_user_pin_and_settings',
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
