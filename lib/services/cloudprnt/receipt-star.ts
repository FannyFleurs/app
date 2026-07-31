import type { ReceiptSnapshot, OrgInfo } from '@/lib/services/receipt-pdf';
import type { ReceiptSettings } from '@/lib/settings/receipt';
import { round2 } from '@/lib/services/money';

/**
 * Jobs StarPRNT pour l'imprimante TICKET (Star CloudPRNT, ex. TSP143 / mC-Print).
 *   - buildDrawerKickStarPrnt : ouvre le tiroir-caisse branché sur l'imprimante
 *     (impulsion « drawer kick »), sans rien imprimer.
 *   - buildTestReceiptStarPrnt : court ticket de test + ouverture tiroir + coupe.
 *   - buildReceiptStarPrnt : ticket de vente complet (mêmes données que le PDF
 *     thermique), en mode texte StarPRNT + code-barres + coupe.
 */

export const STARPRNT_CONTENT_TYPE = 'application/vnd.star.starprnt';

/** Colonnes selon la largeur papier (police A) : 80 mm ≈ 48, 58 mm ≈ 32. */
function columns(paperWidthMm?: number): number {
  return paperWidthMm === 58 ? 32 : 48;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Especes', card: 'Carte Bancaire', check: 'Cheque', transfer: 'Virement',
  gift_card: 'Carte cadeau', credit_note: 'Avoir', deferred: 'En compte', other: 'Autre',
};

const n2 = (x: number) => x.toFixed(2).replace('.', ',');
const eur = (x: number) => `${n2(x)} EUR`;
const qty = (q: number) => (Number.isInteger(q) ? String(q) : String(q).replace('.', ','));
/** Translittère en ASCII (les imprimantes thermiques gèrent mal les accents). */
const ascii = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '');

// Interface minimale de l'encodeur StarPRNT (typings du paquet incomplets).
interface StarEnc {
  initialize(): StarEnc;
  align(a: 'left' | 'center' | 'right'): StarEnc;
  bold(on?: boolean): StarEnc;
  width(n: number): StarEnc;
  height(n: number): StarEnc;
  size(n: number): StarEnc;
  text(s: string): StarEnc;
  line(s: string): StarEnc;
  newline(): StarEnc;
  barcode(value: string, symbology: string, height: number): StarEnc;
  image(img: { data: Uint8Array; width: number; height: number }, width: number, height: number, dither: string): StarEnc;
  cut(): StarEnc;
  pulse(): StarEnc;
  encode(): Uint8Array;
}

/** Dots imprimables selon la largeur papier (têtes Star 203 dpi). */
function headDots(paperWidthMm?: number): number {
  return paperWidthMm === 58 ? 384 : 576;
}

let _receiptFontReady = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureReceiptFont(PImage: any): Promise<void> {
  if (_receiptFontReady) return;
  const path = await import('node:path');
  const dir = path.join(process.cwd(), 'assets', 'fonts');
  PImage.registerFont(path.join(dir, 'BricolageGrotesque-Bold.ttf'), 'ReceiptBold').loadSync();
  _receiptFontReady = true;
}

/**
 * Rend le NOM de la boutique en image bitmap, centré sur toute la largeur de la
 * tête. On passe par une image (et non du texte StarPRNT) car l'imprimante ne
 * centre pas correctement la première ligne texte. Renvoie null en cas d'échec.
 */
async function renderShopNameBitmap(
  text: string, widthDots: number,
): Promise<{ data: Uint8Array; width: number; height: number } | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const PImage: any = await import('pureimage');
    await ensureReceiptFont(PImage);
    const pt = widthDots <= 384 ? 26 : 32;
    // La hauteur DOIT être un multiple de 8 (contrainte StarPRNT image).
    const h = Math.ceil((pt * 1.7) / 8) * 8;
    const canvas = PImage.make(widthDots, h);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, widthDots, h);
    ctx.fillStyle = '#000000';
    ctx.font = `${pt}pt ReceiptBold`;
    const tw = ctx.measureText(text).width;
    ctx.fillText(text, Math.max(0, (widthDots - tw) / 2), Math.round(pt * 1.15));
    return { data: canvas.data as Uint8Array, width: widthDots, height: h };
  } catch {
    return null;
  }
}

/**
 * Décode un logo (data URL PNG/JPEG) et le centre sur un bandeau blanc à la
 * largeur de la tête, pour insertion via `encoder.image(...)`. Renvoie null si
 * le format n'est pas décodable (l'appelant ignore alors le logo).
 */
async function renderLogoBitmap(
  dataUrl: string, widthDots: number,
): Promise<{ data: Uint8Array; width: number; height: number } | null> {
  const m = dataUrl.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  if (!m || !m[1] || !m[2]) return null;
  const mime = m[1].toLowerCase();
  const buf = Buffer.from(m[2], 'base64');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const PImage: any = await import('pureimage');
  const { Readable } = await import('node:stream');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let src: any;
  if (mime.includes('png')) src = await PImage.decodePNGFromStream(Readable.from(buf));
  else if (mime.includes('jpeg') || mime.includes('jpg')) src = await PImage.decodeJPEGFromStream(Readable.from(buf));
  else return null;
  const maxW = Math.round(widthDots * 0.7);
  const maxH = 160;
  const scale = Math.min(maxW / src.width, maxH / src.height, 1);
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  // Hauteur de la toile arrondie au multiple de 8 supérieur (contrainte
  // StarPRNT image) ; le logo est dessiné en haut, le reste reste blanc.
  const ch = Math.ceil(h / 8) * 8;
  const canvas = PImage.make(widthDots, ch);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, widthDots, ch);
  ctx.drawImage(src, Math.round((widthDots - w) / 2), 0, w, h);
  return { data: canvas.data as Uint8Array, width: widthDots, height: ch };
}

async function newEncoder(cols?: number): Promise<StarEnc> {
  const mod = await import('star-prnt-encoder');
  const StarPrntEncoder = mod.default as unknown as new (opts: Record<string, unknown>) => StarEnc;
  // On aligne la largeur de l'encodeur sur celle du papier (retour à la ligne
  // et alignements cohérents avec l'imprimante physique).
  const enc = new StarPrntEncoder(cols ? { columns: cols, width: cols } : {});
  enc.initialize();
  return enc;
}

/** Avance le papier puis coupe (évite que la fin du ticket soit coupée). */
function feedAndCut(enc: StarEnc): void {
  enc.align('left');
  for (let i = 0; i < 5; i++) enc.newline();
  enc.cut();
}

/** Impulsion d'ouverture du tiroir-caisse (aucune impression). */
export async function buildDrawerKickStarPrnt(): Promise<Buffer> {
  const enc = await newEncoder();
  enc.pulse();
  return Buffer.from(enc.encode());
}

/** Ticket de test : en-tête boutique, date, puis ouverture tiroir + coupe. */
export async function buildTestReceiptStarPrnt(shopName?: string | null): Promise<Buffer> {
  const enc = await newEncoder();
  enc.align('center');
  enc.bold(true).line(ascii(shopName?.trim() || 'HelloPos')).bold(false);
  enc.line('-- TEST IMPRESSION --');
  enc.newline();
  enc.align('left');
  enc.line(ascii(new Date().toLocaleString('fr-FR')));
  enc.line('Imprimante ticket CloudPRNT : OK');
  enc.line('Ouverture du tiroir-caisse...');
  enc.pulse(); // ouvre le tiroir en même temps que le ticket sort
  feedAndCut(enc);
  return Buffer.from(enc.encode());
}

export interface ReceiptStarOptions {
  fiscalHash: string;
  cashier?: string | null;
  receipt?: ReceiptSettings | null;
  giftReceipt?: boolean;
  giftLineIndices?: number[] | null;
  customerName?: string | null;
  loyalty?: { earned: number; balance: number; redeemed: number } | null;
  /** Largeur papier en mm (58 ou 80). Par défaut 80. */
  paperWidthMm?: number;
}

/**
 * Ticket de vente complet en StarPRNT texte, calqué sur le PDF thermique :
 * en-tête boutique centré, lignes (QTE/DESC/PU), totaux, règlements + rendu,
 * TVA (montants alignés à droite), fidélité, code-barres, messages de pied.
 * Variante « sans prix » (gift) : uniquement quantités + désignations.
 */
export async function buildReceiptStarPrnt(
  snapshot: ReceiptSnapshot,
  org: OrgInfo,
  options: ReceiptStarOptions,
): Promise<Buffer> {
  const rs = options.receipt ?? null;
  const gift = options.giftReceipt === true;
  const W = columns(options.paperWidthMm);
  const wide = W >= 48;
  const enc = await newEncoder(W);

  // « libellé ........ valeur » sur toute la largeur (valeur alignée à droite).
  const rowStr = (l: string, r: string): string => {
    const ls = ascii(l); const rr = ascii(r);
    const maxLeft = Math.max(0, W - rr.length - 1);
    const lt = ls.length > maxLeft ? ls.slice(0, maxLeft) : ls;
    return lt + ' '.repeat(Math.max(1, W - lt.length - rr.length)) + rr;
  };

  const center = (t: string, bold = false) => {
    enc.align('center'); if (bold) enc.bold(true);
    enc.line(ascii(t));
    if (bold) enc.bold(false);
    enc.align('left');
  };
  const left = (t = '') => { enc.align('left').line(ascii(t)); };
  const rule = () => { enc.align('left').line('-'.repeat(W)); };
  const row = (l: string, r: string, bold = false) => {
    enc.align('left'); if (bold) enc.bold(true);
    enc.line(rowStr(l, r));
    if (bold) enc.bold(false);
  };

  // ---- En-tête boutique (centré) ----
  // Logo (si présent) imprimé en tête.
  const hasLogo = !!(rs?.logo_data_url && rs.logo_data_url.startsWith('data:image'));
  if (hasLogo && rs) {
    try {
      const logo = await renderLogoBitmap(rs.logo_data_url, headDots(options.paperWidthMm));
      if (logo) {
        enc.align('center');
        enc.image(logo, logo.width, logo.height, 'threshold');
        enc.newline();
      }
    } catch { /* logo non décodable : on l'ignore */ }
  }
  // Nom commercial : affiché seulement s'il est renseigné ; sinon repli sur la
  // raison sociale UNIQUEMENT en l'absence de logo (le logo peut le remplacer).
  const shopName = rs?.shop_name?.trim() || (hasLogo ? '' : org.name);
  if (shopName) {
    // Nom rendu en IMAGE centrée (l'imprimante ne centre pas la 1re ligne
    // texte, et le centrage se perd à la moindre magnification). Repli texte
    // si le rendu image échoue.
    let done = false;
    try {
      const bmp = await renderShopNameBitmap(ascii(shopName), headDots(options.paperWidthMm));
      if (bmp) {
        enc.align('center');
        enc.image(bmp, bmp.width, bmp.height, 'threshold');
        enc.newline();
        done = true;
      }
    } catch { /* repli texte ci-dessous */ }
    if (!done) center(shopName, true);
  }
  enc.align('left');
  const address1 = rs?.address_line1?.trim() || org.address?.line1;
  if (address1) center(address1);
  const zipCity = rs?.address_zip_city?.trim()
    || [org.address?.zip, org.address?.city].filter(Boolean).join(' ');
  if (zipCity) center(zipCity);
  const phone = rs?.phone?.trim() || org.phone;
  if (phone) center(phone);
  const siret = rs?.siret?.trim() || org.siret;
  if (siret) center(`Siret : ${siret}`);
  const vat = rs?.vat_number?.trim() || org.vat_number;
  if (vat) center(`TVA : ${vat}`);
  const website = rs?.website?.trim();
  if (website) center(website);

  rule();
  center(`Ticket ${snapshot.receipt_number}${gift ? '' : ' - VENTE'}`);
  if (gift) center('TICKET SANS PRIX', true);
  const date = new Date(snapshot.validated_at);
  center(date.toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }));
  rule();
  if (options.cashier) left(`Servis par: ${options.cashier}`);

  if (snapshot.comment && snapshot.comment.trim()) {
    rule();
    enc.align('left').bold(true).line('Commentaire :').bold(false);
    left(snapshot.comment.trim());
  }
  rule();

  // Codes TVA (A = taux le plus élevé…).
  const rates = [...new Set(snapshot.tva_breakdown.map((t) => t.rate))].sort((a, b) => b - a);
  const codeOf = new Map(rates.map((r, i) => [r, String.fromCharCode(65 + i)]));

  // ---- Lignes ----
  if (gift) {
    const sel = options.giftLineIndices;
    const giftLines = sel && sel.length
      ? snapshot.lines.filter((_, i) => sel.includes(i))
      : snapshot.lines;
    enc.align('left').bold(true).line('QTE DESC').bold(false);
    for (const l of giftLines) left(`${qty(l.quantity)} ${l.label}`);
  } else {
    row('QTE DESC', wide ? 'PU   MONTANT' : 'MONTANT', true);
    for (const l of snapshot.lines) {
      const gross = round2(l.unit_price_ttc * l.quantity);
      const code = codeOf.get(l.tax_rate) ?? '';
      const rightPart = wide
        ? `${n2(l.unit_price_ttc)} ${n2(gross)} ${code}`
        : `${n2(gross)} ${code}`;
      row(`${qty(l.quantity)} ${l.label}`, rightPart);
      if (l.discount_amount > 0) {
        const pct = gross > 0 ? (l.discount_amount / gross) * 100 : 0;
        row(`  Remise ${pct.toFixed(0)}%`, `-${n2(l.discount_amount)}`);
      }
    }
  }
  rule();

  if (!gift) {
    if (snapshot.totals.total_discount > 0) {
      const gross = round2(snapshot.totals.total_ttc + snapshot.totals.total_discount);
      row('Sous total :', eur(gross));
      row('Reduction lignes :', `-${eur(snapshot.totals.total_discount)}`);
    }
    // Total en gros caractères (double largeur).
    enc.align('left').bold(true).width(2).height(2);
    enc.line(ascii(`TOTAL: ${eur(snapshot.totals.total_ttc)}`));
    enc.width(1).height(1).bold(false);
    rule();

    // Règlements (+ rendu monnaie).
    let change = 0;
    for (const p of snapshot.payments) {
      const label = PAYMENT_LABELS[p.method] ?? p.method;
      if (p.method === 'cash' && p.given_amount != null && p.given_amount > p.amount) {
        change = round2(change + (p.given_amount - p.amount));
        row(label, eur(p.given_amount));
      } else {
        row(label, eur(p.amount));
      }
    }
    if (change > 0) row('Rendu', eur(change), true);
    rule();

    // ---- Détail TVA : lignes « libellé → montant » (alignées à droite). ----
    if ((rs?.show_tax_breakdown ?? true) && snapshot.tva_breakdown.length > 0) {
      left('Detail TVA');
      const ordered = [...snapshot.tva_breakdown].sort((a, b) => b.rate - a.rate);
      for (const t of ordered) {
        row(`  TVA ${n2(t.rate)}% (HT ${n2(t.base_ht)})`, n2(t.tva));
      }
      row('Total HT', n2(snapshot.totals.total_ht));
      row('Total TVA', n2(snapshot.totals.total_tva), true);
      rule();
    }

    const loy = options.loyalty;
    const hasLoyalty = !!loy && (loy.earned > 0 || loy.redeemed > 0 || loy.balance > 0);
    if (options.customerName || hasLoyalty) {
      if (options.customerName) center(options.customerName, true);
      if (hasLoyalty && loy) {
        center('Points de fidelite:');
        const parts = [`Total: ${loy.balance}`, `Ticket: ${loy.earned}`];
        if (loy.redeemed > 0) parts.push(`Utilises: ${loy.redeemed}`);
        center(parts.join(' | '));
      }
      rule();
    }

    const totalQty = snapshot.lines.reduce((s, l) => s + l.quantity, 0);
    row('Nombre de produit :', qty(totalQty));
    row('Nombre de ligne :', String(snapshot.lines.length));
    rule();
  }

  if (rs?.show_barcode ?? true) {
    enc.newline().align('center');
    try { enc.barcode(snapshot.receipt_number, 'code128', 60); } catch { /* code non imprimable */ }
    enc.align('left');
  }

  if (!gift) {
    enc.newline().align('center');
    enc.line('Ticket disponible par email sur demande.');
    enc.align('left');
  }

  if (rs?.footer_message?.trim()) { enc.newline(); center(rs.footer_message.trim()); }
  if (rs?.welcome_message?.trim()) center(rs.welcome_message.trim());

  // L'impression n'ouvre JAMAIS le tiroir : celui-ci s'ouvre à l'encaissement
  // selon les modes de règlement (cf. payment_methods.opens_drawer).
  feedAndCut(enc);
  return Buffer.from(enc.encode());
}
