import 'server-only';
import { query } from '@/lib/db/client';
import { IP_PRINTER_KEY, ipPrinterKey, mergeIpPrinterDefaults, type IpPrinterSettings } from './ip-printer';

/**
 * Charge les réglages imprimante IP effectifs pour une boutique.
 *
 * Priorité : configuration propre à la boutique (`ip_printer:<storeId>`), sinon
 * repli sur la configuration organisation (`ip_printer`), sinon valeurs par
 * défaut (désactivée). Ce repli permet à un commerce mono-boutique de
 * configurer une seule fois au niveau organisation.
 */
export async function loadIpPrinterSettings(
  organizationId: string,
  storeId?: string | null,
): Promise<IpPrinterSettings> {
  const storeKey = ipPrinterKey(storeId);
  const { rows } = await query<{ value: Partial<IpPrinterSettings>; key: string }>(
    `SELECT value, key FROM settings
      WHERE organization_id = $1 AND key = ANY($2::text[])
      ORDER BY (key = $3) DESC
      LIMIT 1`,
    [organizationId, [storeKey, IP_PRINTER_KEY], storeKey],
  );
  return mergeIpPrinterDefaults(rows[0]?.value ?? null);
}
