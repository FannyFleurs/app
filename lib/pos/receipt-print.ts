import { Capacitor, registerPlugin } from '@capacitor/core';

interface HelloPosPrinterPlugin {
  printRaw(options: {
    host: string;
    port: number;
    dataBase64: string;
  }): Promise<{
    printed: boolean;
    host: string;
    port: number;
    bytes: number;
  }>;
}

const HelloPosPrinter =
  registerPlugin<HelloPosPrinterPlugin>(
    'HelloPosPrinter',
  );

/**
 * Impression d'un ticket.
 *
 * App native Capacitor :
 * - récupère le flux ESC/POS via /native ;
 * - l'envoie directement à l'IP de l'imprimante via le plugin iOS.
 *
 * Navigateur/PWA :
 * - conserve le fonctionnement CloudPRNT existant.
 */
export async function printReceipt(opts: {
  base: string;
  pdfUrl: string;
  gift?: boolean;
  lines?: number[] | null;
}): Promise<{
  ok: boolean;
  queued: boolean;
  message: string;
}> {
  const nativeReceiptMatch =
    opts.base.match(
      /^\/api\/receipts\/([^/]+)$/,
    );

  if (
    Capacitor.isNativePlatform() &&
    nativeReceiptMatch
  ) {
    try {
      const query =
        new URLSearchParams();

      if (opts.gift) {
        query.set('gift', '1');
      }

      if (opts.lines?.length) {
        query.set(
          'lines',
          opts.lines.join(','),
        );
      }

      const nativeUrl =
        `${opts.base}/native` +
        (
          query.size
            ? `?${query.toString()}`
            : ''
        );

      const r = await fetch(
        nativeUrl,
        {
          method: 'GET',
          cache: 'no-store',
        },
      );

      if (!r.ok) {
        const body =
          await r
            .json()
            .catch(() => ({}));

        const detail =
          body?.error
            ? ` (${body.error})`
            : '';

        return {
          ok: false,
          queued: false,
          message:
            `Impression native impossible${detail}.`,
        };
      }

      const payload =
        await r.json() as {
          printer?: {
            host?: string;
            port?: number;
          };
          data_base64?: string;
        };

      const host =
        payload.printer?.host?.trim();

      const port =
        payload.printer?.port ?? 9100;

      const dataBase64 =
        payload.data_base64;

      if (
        !host ||
        !dataBase64
      ) {
        return {
          ok: false,
          queued: false,
          message:
            'Impression native impossible (configuration incomplète).',
        };
      }

      await HelloPosPrinter.printRaw({
        host,
        port,
        dataBase64,
      });

      return {
        ok: true,
        queued: false,
        message: 'Ticket imprimé.',
      };
    } catch (error) {
      const detail =
        error instanceof Error &&
        error.message
          ? ` (${error.message})`
          : '';

      return {
        ok: false,
        queued: false,
        message:
          `Impression native impossible${detail}.`,
      };
    }
  }

  // Navigateur / PWA :
  // fonctionnement CloudPRNT existant.
  try {
    const r = await fetch(
      `${opts.base}/print`,
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json',
        },
        body: JSON.stringify({
          gift:
            opts.gift || undefined,
          lines:
            opts.lines?.length
              ? opts.lines
              : undefined,
        }),
      },
    );

    if (r.ok) {
      return {
        ok: true,
        queued: true,
        message:
          'Ticket envoyé à l’imprimante.',
      };
    }

    if (r.status === 409) {
      const q =
        opts.gift
          ? `?gift=1${
              opts.lines?.length
                ? `&lines=${opts.lines.join(',')}`
                : ''
            }`
          : '';

      try {
        window.open(
          `${opts.pdfUrl}${q}`,
          '_blank',
        );
      } catch {
        // Popup bloquée.
      }

      return {
        ok: true,
        queued: false,
        message:
          'Aucune imprimante ticket configurée — ouverture du PDF.',
      };
    }

    return {
      ok: false,
      queued: false,
      message:
        'Impression impossible.',
    };
  } catch {
    return {
      ok: false,
      queued: false,
      message:
        'Impression impossible (réseau).',
    };
  }
}
