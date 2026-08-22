'use client';

import { registerPlugin } from '@capacitor/core';

export interface PrintRawOptions {
  host: string;
  port?: number;
  dataBase64: string;
}

export interface PrintRawResult {
  printed: boolean;
  host: string;
  port: number;
  bytes: number;
}

export interface HelloPosPrinterPlugin {
  printRaw(options: PrintRawOptions): Promise<PrintRawResult>;
}

export const HelloPosPrinter =
  registerPlugin<HelloPosPrinterPlugin>(
    'HelloPosPrinter',
  );

export function uint8ArrayToBase64(
  data: Uint8Array,
): string {
  let binary = '';
  const chunkSize = 0x8000;

  for (
    let i = 0;
    i < data.length;
    i += chunkSize
  ) {
    binary += String.fromCharCode(
      ...data.subarray(
        i,
        i + chunkSize,
      ),
    );
  }

  return btoa(binary);
}
