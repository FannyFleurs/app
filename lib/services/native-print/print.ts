'use client';

import {
  HelloPosPrinter,
  uint8ArrayToBase64,
} from '@/lib/native/hellopos-printer';

export interface NativePrintRawOptions {
  host: string;
  port?: number;
}

/**
 * Envoie directement des octets d'impression à l'imprimante réseau
 * via le plugin natif Capacitor HelloPosPrinter.
 *
 * Aucun passage par CloudPRNT.
 */
export async function printNativeRaw(
  data: Uint8Array,
  options: NativePrintRawOptions,
): Promise<void> {
  const host = options.host.trim();

  if (!host) {
    throw new Error(
      "L'adresse IP de l'imprimante est manquante.",
    );
  }

  const port = options.port ?? 9100;

  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error(
      "Le port de l'imprimante est invalide.",
    );
  }

  if (data.length === 0) {
    throw new Error(
      "Aucune donnée à envoyer à l'imprimante.",
    );
  }

  const result = await HelloPosPrinter.printRaw({
    host,
    port,
    dataBase64: uint8ArrayToBase64(data),
  });

  if (!result.printed) {
    throw new Error(
      "L'imprimante n'a pas confirmé l'impression.",
    );
  }
}
