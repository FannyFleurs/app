import { formatEUR } from '@/lib/services/money';
import { isValidEan13 } from '@/lib/services/ean';
import { type LabelSettings } from '@/lib/settings/label';
import { type LabelProduct, discountedPrice } from '@/lib/services/label-print';

/**
 * Rendu des étiquettes en commandes **StarPRNT brutes**
 * (`application/vnd.star.starprnt`), le format nativement supporté par la
 * mC-Label3 via CloudPRNT.
 *
 * ⚠️ La mC-Label3 NE supporte PAS le « Star Document Markup »
 * (`text/vnd.star.markup`) : elle récupère bien le job mais l'ignore
 * silencieusement (rien n'est imprimé). On génère donc des commandes
 * StarPRNT via `star-prnt-encoder` : l'imprimante rend elle-même le texte et
 * le code-barres EAN-13 (net, sans rasterisation).
 */

export const STARPRNT_CONTENT_TYPE = 'application/vnd.star.starprnt';

// Type de l'encodeur, importé dynamiquement (paquet ESM `type: module`).
type Encoder = import('star-prnt-encoder').default;

// Avance papier de `mm` millimètres (ESC J n ; n en points de 0,125 mm à
// 203 dpi). Sert à positionner verticalement les blocs sur l'étiquette.
function feed(enc: Encoder, mm: number): void {
  const dots = Math.min(255, Math.max(0, Math.round(mm / 0.125)));
  if (dots > 0) enc.raw([0x1b, 0x4a, dots]);
}

// Réglages de mise en page (faciles à ajuster au dixième après un test réel).
const LAYOUT = {
  topMarginMm: 2,     // marge haute
  nameToPriceMm: 9,   // espace nom → prix (positionne le prix vers le centre)
  priceToBarcodeMm: 10, // espace prix → code-barres (pousse le code-barres en bas)
  cutExtraMm: 1,      // avance après le form feed avant coupe (gap ≈ 3 mm mais 3 = 2 mm trop tard)
};

/** Ajoute une étiquette au flux de l'encodeur (sans initialisation). */
function appendLabel(enc: Encoder, p: LabelProduct, s: LabelSettings): void {
  enc.align('center');
  feed(enc, LAYOUT.topMarginMm);

  // --- HAUT : NOM (plus gros) ---
  if (s.show_name && p.name) {
    const name = p.name.length > 18 ? `${p.name.slice(0, 17)}…` : p.name;
    enc.width(2).height(2).bold(true).text(name).bold(false).width(1).height(1).newline();
  }
  if (s.show_sku && p.sku) {
    enc.text(p.sku).newline();
  }

  // --- CENTRE : PRIX en gros ---
  feed(enc, LAYOUT.nameToPriceMm);
  if (s.show_price) {
    const disc = s.show_discount ? discountedPrice(p) : null;
    if (disc != null) {
      enc.text(`au lieu de ${formatEUR(p.sale_price_ttc)}`).newline();
      enc.width(2).height(3).bold(true).text(formatEUR(disc)).bold(false).width(1).height(1).newline();
    } else {
      enc.width(2).height(3).bold(true).text(formatEUR(p.sale_price_ttc)).bold(false).width(1).height(1).newline();
    }
  }

  // --- BAS : CODE-BARRES + EAN collés (HRI imprimé par l'imprimante) ---
  feed(enc, LAYOUT.priceToBarcodeMm);
  if (s.show_barcode && p.barcode) {
    if (isValidEan13(p.barcode)) {
      // text:true → l'imprimante imprime le numéro EAN directement sous les
      // barres (collé), pas besoin d'une ligne séparée.
      enc.barcode(p.barcode, 'ean13', { height: 52, text: true });
      enc.newline();
    } else {
      enc.text(p.barcode).newline();
    }
  }

  // Fin d'étiquette : form feed jusqu'au gap (capteur), petite avance pour
  // amener la lame dans le gap, puis coupe.
  enc.raw([0x0c]);
  feed(enc, LAYOUT.cutExtraMm);
  enc.cut();
}

/**
 * Construit le flux StarPRNT pour une liste d'articles (chacun × sa quantité).
 * Async : l'encodeur est importé dynamiquement (module ESM).
 */
export async function buildLabelsStarPrnt(
  entries: Array<{ product: LabelProduct; qty: number }>,
  settings: LabelSettings,
): Promise<Buffer> {
  const mod = await import('star-prnt-encoder');
  const StarPrntEncoder = mod.default;
  // Le centrage se fait par remplissage d'espaces : `columns` doit refléter
  // la largeur physique de l'étiquette (police A = 12 points, ~8 pts/mm à
  // 203 dpi → ~0,63 caractère/mm).
  const columns = Math.max(16, Math.min(48, Math.round((settings.width_mm || 50) * 0.63)));
  const enc = new StarPrntEncoder({ columns });
  enc.initialize();
  // Codepage 858 : accents français + symbole € (validé comme supporté par
  // la mC-Label3).
  enc.codepage('cp858');
  for (const { product, qty } of entries) {
    const n = Math.max(1, Math.min(200, Math.round(qty || 0)));
    for (let i = 0; i < n; i++) appendLabel(enc, product, settings);
  }
  return Buffer.from(enc.encode());
}

/** Nombre total d'étiquettes d'un lot (pour le libellé du job). */
export function countLabels(entries: Array<{ qty: number }>): number {
  return entries.reduce((n, e) => n + Math.max(1, Math.min(200, Math.round(e.qty || 0))), 0);
}
