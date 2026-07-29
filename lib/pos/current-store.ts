import { cookies } from 'next/headers';
import { query } from '@/lib/db/client';

/**
 * Résout la boutique du POSTE courant à partir du cookie device
 * (`webpos_device_id`) et de la caisse qui y est liée (registers.device_id).
 *
 * Renvoie null si le poste n'est lié à aucune caisse active (ex. back-office
 * ou laptop admin non appairé) — l'appelant conserve alors son comportement
 * « toutes boutiques ». Sur un poste de caisse appairé, on obtient la
 * boutique réelle du poste, ce qui permet d'isoler « Ma journée » (liste des
 * ventes, X) à la seule boutique où l'on encaisse.
 */
export async function resolveDeviceStoreId(organizationId: string): Promise<string | null> {
  const deviceId = cookies().get('webpos_device_id')?.value;
  if (!deviceId) return null;
  try {
    const r = await query<{ store_id: string }>(
      `SELECT store_id FROM registers
        WHERE organization_id = $1 AND device_id = $2 AND is_active = TRUE
        LIMIT 1`,
      [organizationId, deviceId],
    );
    return r.rows[0]?.store_id ?? null;
  } catch {
    return null;
  }
}
