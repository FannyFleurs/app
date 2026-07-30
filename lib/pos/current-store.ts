import { cookies, headers } from 'next/headers';
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

/**
 * Boutique à laquelle VERROUILLER un réglage « par boutique » selon le
 * contexte :
 *  - En back-office (header x-webpos-bo=1) : renvoie null → chaque page garde
 *    son sélecteur de boutique (gestion multi-boutiques centralisée).
 *  - Sur un poste de caisse appairé : renvoie la boutique du poste → la page
 *    masque le sélecteur et n'édite QUE cette boutique (chaque boutique est
 *    autonome). Null si le poste n'est pas appairé (repli : sélecteur visible).
 */
export async function resolveSettingsLockStoreId(organizationId: string): Promise<string | null> {
  const backOffice = headers().get('x-webpos-bo') === '1';
  if (backOffice) return null;
  return resolveDeviceStoreId(organizationId);
}
