/**
 * Réglages de l'imprimante ticket réseau (IP / ESC-POS RAW port 9100).
 *
 * Ces réglages sont saisis dans le back-office (sous l'imprimante Star) mais ne
 * sont exploitables que par l'application native iOS/Android : un navigateur
 * web ne peut pas ouvrir de socket TCP vers l'imprimante. Ils sont stockés par
 * boutique (clé `ip_printer:<storeId>`), avec repli au niveau organisation.
 */

export const IP_PRINTER_KEY = 'ip_printer';

export function ipPrinterKey(storeId?: string | null): string {
  return storeId ? `${IP_PRINTER_KEY}:${storeId}` : IP_PRINTER_KEY;
}

export interface IpPrinterSettings {
  /** Active l'impression IP native pour cette boutique. */
  enabled: boolean;
  /** Adresse IP (ou nom d'hôte) de l'imprimante. */
  host: string;
  /** Port RAW (9100 par défaut). */
  port: number;
  /** Largeur d'impression en points : 576 (80 mm) ou 384 (58 mm). */
  width_dots: number;
}

export const IP_PRINTER_DEFAULTS: IpPrinterSettings = {
  enabled: false,
  host: '',
  port: 9100,
  width_dots: 576,
};

export function mergeIpPrinterDefaults(
  partial: Partial<IpPrinterSettings> | null | undefined,
): IpPrinterSettings {
  const p = partial ?? {};
  const port = Number.isInteger(p.port) && (p.port as number) > 0 && (p.port as number) <= 65535
    ? (p.port as number)
    : IP_PRINTER_DEFAULTS.port;
  return {
    enabled: p.enabled === true,
    host: typeof p.host === 'string' ? p.host.trim() : '',
    port,
    width_dots: p.width_dots === 384 ? 384 : 576,
  };
}
