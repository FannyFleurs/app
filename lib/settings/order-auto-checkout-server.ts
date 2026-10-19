import 'server-only';
import { loadScopedSettingValue } from './scoped-server';
import {
  ORDER_AUTO_CHECKOUT_KEY, mergeOrderAutoCheckoutDefaults, type OrderAutoCheckoutSettings,
} from './order-auto-checkout';

export async function loadOrderAutoCheckout(
  organizationId: string,
  storeId?: string | null,
): Promise<OrderAutoCheckoutSettings> {
  const scoped = await loadScopedSettingValue<OrderAutoCheckoutSettings>(
    organizationId, ORDER_AUTO_CHECKOUT_KEY, storeId,
  );
  return mergeOrderAutoCheckoutDefaults(scoped);
}
