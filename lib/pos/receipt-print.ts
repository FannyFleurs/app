/**
 * Impression d'un ticket à la demande (client).
 * Envoie le ticket à l'imprimante TICKET CloudPRNT via l'API. Si aucune
 * imprimante n'est configurée (409), repli sur l'ouverture du PDF pour ne pas
 * bloquer l'usage (période de transition avant installation de l'imprimante).
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
      try { window.open(`${opts.pdfUrl}${q}`, '_blank'); } catch { /* popup bloqué */ }
      return { ok: true, queued: false, message: 'Aucune imprimante ticket configurée — ouverture du PDF.' };
    }
    return { ok: false, queued: false, message: 'Impression impossible.' };
  } catch {
    return { ok: false, queued: false, message: 'Impression impossible (réseau).' };
  }
}
