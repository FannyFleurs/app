import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';

export type NativePrinterLanguage = 'star-prnt' | 'esc-pos';

export interface NativePrinterEncoderOptions {
  paperWidthMm?: 58 | 80;
  language?: NativePrinterLanguage;
  printerModel?: string;
}

/**
 * Encodeur brut destiné à l'application native.
 *
 * IMPORTANT :
 * - indépendant de CloudPRNT ;
 * - n'altère aucun réglage PWA ;
 * - produit uniquement les octets à envoyer ensuite sur TCP/IP:9100.
 */
export function createNativeReceiptEncoder(
  options: NativePrinterEncoderOptions = {},
) {
  const paperWidthMm = options.paperWidthMm ?? 80;
  const columns = paperWidthMm === 58 ? 32 : 48;

  const config: Record<string, unknown> = {
    columns,
    width: columns,
    language: options.language ?? 'star-prnt',
    codepage: 'auto',
  };

  if (options.printerModel) {
    config.printerModel = options.printerModel;
  }

  const encoder = new ReceiptPrinterEncoder(config);

  encoder.initialize();

  return encoder;
}

export function encodeNativePrinterData(
  encoder: ReturnType<typeof createNativeReceiptEncoder>,
): Uint8Array {
  return encoder.encode();
}
