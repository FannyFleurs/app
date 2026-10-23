import { headers } from 'next/headers';
import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import {
  STOCK_MOVEMENT_REASONS_KEY,
  mergeStockMovementReasonsDefaults,
  type StockMovementReasonsSettings,
} from '@/lib/settings/stock-movement-reasons';
import StockMovementReasonsSettingsForm from './StockMovementReasonsSettingsForm';

export const dynamic = 'force-dynamic';

/**
 * Motifs de mouvement de stock — back-office uniquement. Liste des motifs
 * proposés pour un mouvement manuel (entrée/sortie), et obligation ou non de
 * les justifier pour une sortie. Réglage au niveau organisation.
 */
export default async function StockMovementReasonsSettingsPage() {
  const user = (await readSessionFromCookie())!;
  const backOffice = headers().get('x-webpos-bo') === '1';
  if (!backOffice) {
    return <div className="p-8 text-sm text-ink-soft">Ce réglage est disponible depuis le back-office.</div>;
  }
  if (!(await userCan(user, 'settings.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const canWrite = await userCan(user, 'settings.write');

  const { rows } = await query<{ value: Partial<StockMovementReasonsSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [user.organizationId, STOCK_MOVEMENT_REASONS_KEY],
  );
  const settings = mergeStockMovementReasonsDefaults(rows[0]?.value ?? null);

  return <StockMovementReasonsSettingsForm initial={settings} canWrite={canWrite} />;
}
