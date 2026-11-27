import 'server-only';
import { query } from '@/lib/db/client';

// La table category_discounts (migration 0102) peut manquer sur une base non
// migrée : on la sonde une fois (cache module) pour ne rien casser en amont.
let _hasTable: boolean | null = null;
export async function hasCategoryDiscountsTable(): Promise<boolean> {
  if (_hasTable !== null) return _hasTable;
  const r = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables WHERE table_name = 'category_discounts'
     ) AS exists`,
  );
  _hasTable = !!r.rows[0]?.exists;
  return _hasTable;
}
