'use client';

import { buildLabelsDocument, openPrintWindow, type LabelProduct } from '@/lib/services/label-print';
import type { LabelSettings } from '@/lib/settings/label';

/**
 * Impression d'étiquettes du PDA — chemin UNIQUE, partagé par tous les écrans.
 *
 * Deux modes, dans cet ordre :
 *  1. imprimante réseau (CloudPRNT) déclarée pour la boutique → envoi direct ;
 *  2. sinon, fenêtre d'impression du navigateur.
 *
 * Centralisé ici pour qu'« imprimer une étiquette » se comporte exactement de
 * la même façon depuis l'écran Étiquettes et depuis l'entrée de marchandise.
 */

export interface PrintOutcome {
  ok: boolean;
  message: string;
}

export async function printProductLabels({
  product, qty, settings, cloudPrinter, storeId,
}: {
  product: LabelProduct;
  qty: number;
  settings: LabelSettings;
  /** Nom de l'imprimante réseau, ou null pour l'impression navigateur. */
  cloudPrinter: string | null;
  storeId: string | null;
}): Promise<PrintOutcome> {
  if (qty < 1) return { ok: false, message: 'Quantité invalide.' };

  if (cloudPrinter) {
    try {
      const r = await fetch('/api/cloudprnt/print-labels', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: [{ product, qty }], store_id: storeId }),
      });
      if (r.ok) {
        const j = await r.json();
        return { ok: true, message: `${j.count} étiquette(s) envoyée(s) à « ${j.printer} ».` };
      }
      const j = await r.json().catch(() => null);
      if (j?.error !== 'NO_PRINTER') {
        return {
          ok: false,
          message: j?.message
            ? `Échec de l'envoi à l'imprimante : ${j.message}`
            : "Échec de l'envoi à l'imprimante.",
        };
      }
      // Imprimante retirée entre-temps : on bascule sur le navigateur plutôt
      // que de laisser l'opérateur sans étiquette.
    } catch {
      return { ok: false, message: 'Imprimante injoignable (réseau).' };
    }
  }

  const doc = buildLabelsDocument([{ product, qty }], settings);
  if (openPrintWindow(doc)) {
    return { ok: true, message: `${qty} étiquette(s) envoyée(s) à l'impression.` };
  }
  return { ok: false, message: 'Autorisez les fenêtres pop-up pour imprimer.' };
}
