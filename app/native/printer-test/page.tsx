'use client';

import { useState } from 'react';
import {
  isNativeHelloPos,
  testNetworkPrinter,
  type PrinterConnectionResult,
} from '@/lib/native/printer';

export default function NativePrinterTestPage() {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('9100');
  const [result, setResult] = useState<PrinterConnectionResult | null>(null);
  const [loading, setLoading] = useState(false);

  const native = isNativeHelloPos();

  async function runTest() {
    setLoading(true);
    setResult(null);

    try {
      const res = await testNetworkPrinter(
        host.trim(),
        Number(port) || 9100,
      );
      setResult(res);
    } catch (error) {
      setResult({
        connected: false,
        host,
        port: Number(port) || 9100,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white p-8 text-black">
      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">
            Diagnostic imprimante HelloPos
          </h1>

          <p className="mt-2 text-sm text-gray-600">
            Environnement : {native ? 'Application native' : 'Navigateur / PWA'}
          </p>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Adresse IP</span>
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="192.168.1.50"
              className="mt-1 w-full rounded-lg border px-3 py-3"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Port</span>
            <input
              value={port}
              onChange={(e) => setPort(e.target.value)}
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border px-3 py-3"
            />
          </label>

          <button
            type="button"
            onClick={runTest}
            disabled={!host.trim() || loading}
            className="w-full rounded-lg bg-black px-4 py-3 text-white disabled:opacity-40"
          >
            {loading ? 'Test en cours…' : 'Tester la connexion'}
          </button>
        </div>

        {result && (
          <pre className="overflow-auto rounded-lg bg-gray-100 p-4 text-sm">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </main>
  );
}
