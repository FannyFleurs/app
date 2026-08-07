import { round2 } from './money';

/**
 * Noyau partagé des étiquettes : la forme d'un article et le calcul du prix
 * remisé.
 *
 * Extrait de `label-print.ts` pour que le moteur de mise en page puisse s'en
 * servir sans créer de cycle d'import — `label-print.ts` consomme désormais ce
 * moteur pour produire son HTML.
 */

export interface LabelProduct {
  name: string;
  sku?: string | null;
  barcode: string | null;
  sale_price_ttc: number;
  discount_type?: 'percent' | 'amount' | null;
  discount_value?: number | null;
}

/** Prix remisé (ou null si aucune remise valide). */
export function discountedPrice(p: LabelProduct): number | null {
  if (!p.discount_type || !p.discount_value || p.discount_value <= 0) return null;
  const raw = p.discount_type === 'percent'
    ? p.sale_price_ttc * (1 - p.discount_value / 100)
    : p.sale_price_ttc - p.discount_value;
  const v = round2(Math.max(0, raw));
  return v < p.sale_price_ttc ? v : null;
}
