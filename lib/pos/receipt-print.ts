import { downloadFile } from '@/lib/ui/download-file';

/**
 * Impression d'un ticket à la demande (client).
 * Envoie le ticket à l'imprimante TICKET CloudPRNT via l'API. Si aucune
 * imprimante n'est configurée (409), repli sur le téléchargement du PDF pour
 * ne pas bloquer l'usage (période de transition avant installation de
 * l'imprimante).
 */
export async function printReceipt(opts: {
  /** Base de l'API ticket : `/api/receipts/<id>` ou `/api/receipts/by-sale/<saleId>`. */
  base: string;
  /** URL du PDF (sans query) pour le repli. */
  pdfUrl: string;
  gift?: boolean;
  lines?: number[] | null;
}): Promise<{ ok: boolean; queued: boolean; message: string }> {
  try {
    const r = await fetch(`${opts.base}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gift: opts.gift || undefined, lines: opts.lines?.length ? opts.lines : undefined }),
    });
    if (r.ok) {
      return { ok: true, queued: true, message: 'Ticket envoyé à l’imprimante.' };
    }
    if (r.status === 409) {
      const q = opts.gift
        ? `?gift=1${opts.lines?.length ? `&lines=${opts.lines.join(',')}` : ''}`
        : '';
      // Téléchargement (fetch + blob), pas un lien `target="_blank"` : dans
      // l'app native (Capacitor), une navigation vers une route authentifiée
      // bascule sur Safari, qui n'a pas la session de la WebView embarquée.
      await downloadFile(`${opts.pdfUrl}${q}`, 'ticket.pdf');
      return { ok: true, queued: false, message: 'Aucune imprimante ticket configurée — PDF téléchargé.' };
    }
    // Échec imprimante (ex. app native : imprimante IP injoignable). On invite
    // à vérifier l'imprimante puis à réimprimer (le bouton relance l'envoi).
    const err = await r.json().catch(() => null);
    if (err?.error === 'NATIVE_PRINT_FAILED') {
      return { ok: false, queued: false, message: 'Imprimante injoignable — vérifiez qu’elle est allumée et connectée, puis réimprimez.' };
    }
    return { ok: false, queued: false, message: 'Impression échouée — réessayez.' };
  } catch {
    return { ok: false, queued: false, message: 'Impression impossible (réseau) — réessayez.' };
  }
}
