import { Capacitor, registerPlugin } from '@capacitor/core';

export interface PrinterConnectionResult {
  connected: boolean;
  host: string;
  port: number;
  error?: string;
}

interface HelloPosPrinterPlugin {
  testConnection(options: {
    host: string;
    port?: number;
  }): Promise<PrinterConnectionResult>;
}

const HelloPosPrinter =
  registerPlugin<HelloPosPrinterPlugin>('HelloPosPrinter');

export function isNativeHelloPos(): boolean {
  return Capacitor.isNativePlatform();
}

export async function testNetworkPrinter(
  host: string,
  port = 9100,
): Promise<PrinterConnectionResult> {
  if (!Capacitor.isNativePlatform()) {
    return {
      connected: false,
      host,
      port,
      error: 'Fonction disponible uniquement dans l’application native HelloPos.',
    };
  }

  return HelloPosPrinter.testConnection({
    host,
    port,
  });
}
