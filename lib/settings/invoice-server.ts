import 'server-only';
import { loadScopedSettingValue } from './scoped-server';
import {
  INVOICE_SETTINGS_KEY,
  mergeInvoiceDefaults,
  type InvoiceSettings,
} from './invoice';

/**
 * Charge le paramétrage facturation effectif d'une boutique (RIB + conditions
 * de règlement par défaut), avec repli sur la configuration organisation puis
 * les valeurs par défaut.
 */
export async function loadInvoiceSettings(
  organizationId: string,
  storeId?: string | null,
): Promise<InvoiceSettings> {
  const value = await loadScopedSettingValue<InvoiceSettings>(
    organizationId,
    INVOICE_SETTINGS_KEY,
    storeId,
  );
  return mergeInvoiceDefaults(value);
}
