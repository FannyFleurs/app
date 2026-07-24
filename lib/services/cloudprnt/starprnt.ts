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

/** Ajoute une étiquette au flux de l'encodeur (sans initialisation). */
function appendLabel(enc: Encoder, p: LabelProduct, s: LabelSettings): void {
  enc.align('center');

  // Petite marge haute pour ne pas coller au bord supérieur de l'étiquette.
  enc.newline();

  if (s.show_name && p.name) {
    // Nom sur 1-2 lignes, tronqué pour ne pas déborder d'une petite étiquette.
    const name = p.name.length > 40 ? `${p.name.slice(0, 39)}…` : p.name;
    enc.bold(true).text(name).bold(false).newline();
  }

  if (s.show_sku && p.sku) {
    enc.text(p.sku).newline();
  }

  if (s.show_barcode && p.barcode) {
    if (isValidEan13(p.barcode)) {
      enc.barcode(p.barcode, 'ean13', 56);
      // Numéro lisible sous le code-barres (l'encodeur n'imprime pas le HRI).
      enc.newline().text(p.barcode).newline();
    } else {
      // Code-barres non EAN-13 : au moins imprimer le code en clair.
      enc.text(p.barcode).newline();
    }
  }

  if (s.show_price) {
    const disc = s.show_discount ? discountedPrice(p) : null;
    if (disc != null) {
      enc.text(`au lieu de ${formatEUR(p.sale_price_ttc)}`).newline();
      enc.width(2).height(2).bold(true).text(formatEUR(disc)).bold(false).width(1).height(1).newline();
    } else {
      enc.width(2).height(2).bold(true).text(formatEUR(p.sale_price_ttc)).bold(false).width(1).height(1).newline();
    }
  }

  // Fin d'étiquette :
  //  1) form feed (0x0C) : le capteur de gap arrête l'imprimante au bord de
  //     l'étiquette (fin des 51 mm),
  //  2) avance de la largeur du gap prédécoupé pour amener la lame au milieu
  //     du gap (sinon la coupe tombe ~3 mm trop tôt, au ras du texte/étiquette),
  //  3) coupe.
  // Avance en pas de 0,125 mm (1 point à 203 dpi) via ESC J n. Gap ≈ 3 mm.
  const gapMm = 3;
  const gapDots = Math.min(255, Math.max(0, Math.round(gapMm / 0.125)));
  enc.raw([0x0c]);
  enc.raw([0x1b, 0x4a, gapDots]); // ESC J n : avance n points (~3 mm)
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
