import 'server-only';
import { query } from '@/lib/db/client';

export { monthBounds } from './targets';

// La table revenue_targets (migration 0077) peut manquer sur une base non
// migrée : on la sonde une fois (cache module) pour ne rien casser en amont.
let _hasTargets: boolean | null = null;
export async function hasTargetsTable(): Promise<boolean> {
  if (_hasTargets !== null) return _hasTargets;
  const r = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables WHERE table_name = 'revenue_targets'
     ) AS exists`,
  );
  _hasTargets = !!r.rows[0]?.exists;
  return _hasTargets;
}

// Table d'historique de CA importé (migration 0076) : peut manquer sur une base
// non migrée. Sondée une fois (cache module).
let _hasHistory: boolean | null = null;
export async function hasRevenueHistoryTable(): Promise<boolean> {
  if (_hasHistory !== null) return _hasHistory;
  const r = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables WHERE table_name = 'revenue_history'
     ) AS exists`,
  );
  _hasHistory = !!r.rows[0]?.exists;
  return _hasHistory;
}

