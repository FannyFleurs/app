import 'server-only';
import { query } from '@/lib/db/client';
import { normalizeWeights, DEFAULT_WEIGHTS, type WeekWeights } from './objectives';

// Semaine-type par boutique (poids par jour, 0 = fermé) rangée dans `settings`,
// clé `revenue_objectives`, valeur { schedule: { [storeId]: number[7] } }.
const KEY = 'revenue_objectives';

export async function loadSchedules(organizationId: string): Promise<Record<string, WeekWeights>> {
  const { rows } = await query<{ value: { schedule?: Record<string, unknown> } }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [organizationId, KEY],
  );
  const raw = rows[0]?.value?.schedule ?? {};
  const out: Record<string, WeekWeights> = {};
  for (const [sid, w] of Object.entries(raw)) out[sid] = normalizeWeights(w);
  return out;
}

export function scheduleFor(schedules: Record<string, WeekWeights>, storeId: string): WeekWeights {
  return schedules[storeId] ?? (DEFAULT_WEIGHTS.slice() as WeekWeights);
}

export async function saveSchedule(
  organizationId: string, storeId: string, weights: WeekWeights, updatedBy: string | null,
): Promise<void> {
  const schedules = await loadSchedules(organizationId);
  schedules[storeId] = normalizeWeights(weights);
  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [organizationId, KEY, JSON.stringify({ schedule: schedules }), updatedBy],
  );
}
