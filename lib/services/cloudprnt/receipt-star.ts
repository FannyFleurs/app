import type { ReceiptSnapshot, OrgInfo } from '@/lib/services/receipt-pdf';
import type { ReceiptSettings } from '@/lib/settings/receipt';
import type { DayReport } from '@/lib/services/day-report';
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
    // Grande taille par défaut, réduite si le nom est trop long pour la largeur.
    let pt = widthDots <= 384 ? 32 : 46;
    const probe = PImage.make(2, 2).getContext('2d');
    probe.font = `${pt}pt ReceiptBold`;
    while (pt > 14 && probe.measureText(text).width > widthDots - 8) {
      pt -= 2;
      probe.font = `${pt}pt ReceiptBold`;
    }
    // Marges haut/bas resserrées ; hauteur multiple de 8 (contrainte StarPRNT).
    const h = Math.ceil((pt * 1.08) / 8) * 8;
    const canvas = PImage.make(widthDots, h);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, widthDots, h);
    ctx.fillStyle = '#000000';
    ctx.font = `${pt}pt ReceiptBold`;
    const tw = ctx.measureText(text).width;
    ctx.fillText(text, Math.max(0, (widthDots - tw) / 2), Math.round(pt * 0.86));
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
    if (!done) {
      // Repli texte (si le rendu image échoue) : une ligne vide d'abord, car
      // l'imprimante ne centre pas la TOUTE PREMIÈRE ligne imprimée.
      enc.newline();
      center(shopName, true);
    }
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

// ---------------------------------------------------------------------------
// Rapport Z / X et reçu de remise en banque (StarPRNT)
// ---------------------------------------------------------------------------

const eur2 = (n: number) => `${n.toFixed(2).replace('.', ',')} EUR`;
const pct2 = (r: number) => `${r.toFixed(2).replace('.', ',')} %`;
const dtFr = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : '—';

/** Fabrique des helpers de mise en page partagés (largeur W en colonnes). */
function layout(enc: StarEnc, W: number) {
  const center = (t: string, bold = false) => {
    enc.align('center'); if (bold) enc.bold(true);
    enc.line(ascii(t));
    if (bold) enc.bold(false);
    enc.align('left');
  };
  const left = (t = '') => { enc.align('left').line(ascii(t)); };
  const rule = () => { enc.align('left').line('-'.repeat(W)); };
  const rowStr = (l: string, r: string): string => {
    const ls = ascii(l), rr = ascii(r);
    const maxLeft = Math.max(0, W - rr.length - 1);
    const lt = ls.length > maxLeft ? ls.slice(0, maxLeft) : ls;
    return lt + ' '.repeat(Math.max(1, W - lt.length - rr.length)) + rr;
  };
  const row = (l: string, r: string, bold = false) => {
    enc.align('left'); if (bold) enc.bold(true);
    enc.line(rowStr(l, r));
    if (bold) enc.bold(false);
  };
  return { center, left, rule, row };
}

/** Imprime le nom de la boutique (image centrée ; repli texte centré). */
async function printShopName(enc: StarEnc, shopName: string | null | undefined, paperWidthMm?: number) {
  const name = shopName?.trim();
  if (!name) return;
  try {
    const bmp = await renderShopNameBitmap(ascii(name), headDots(paperWidthMm));
    if (bmp) {
      enc.align('center');
      enc.image(bmp, bmp.width, bmp.height, 'threshold');
      enc.newline();
      enc.align('left');
      return;
    }
  } catch { /* repli texte */ }
  enc.newline();
  layout(enc, columns(paperWidthMm)).center(name, true);
}

/**
 * Rapport Z (ou X) en StarPRNT — mêmes données que le PDF, format ticket.
 */
export async function buildZReportStarPrnt(
  report: DayReport,
  settings: ReceiptSettings | null,
  paperWidthMm?: number,
): Promise<Buffer> {
  const W = columns(paperWidthMm);
  const enc = await newEncoder(W);
  const { center, left, rule, row } = layout(enc, W);
  const id = report.identity;

  await printShopName(enc, settings?.shop_name?.trim() || id.name || report.store_name, paperWidthMm);
  if (id.line1) center(id.line1);
  if (id.line2) center(id.line2);
  const zc = [id.zip, id.city, id.country].filter(Boolean).join(' ');
  if (zc) center(zc);
  if (id.phone) center(id.phone);
  if (id.siret) center(`Siret : ${id.siret}`);
  if (id.vat_number) center(`TVA : ${id.vat_number}`);
  if (id.website) center(id.website);

  rule();
  center('FINANCIER');
  center(report.kind, true);
  rule();
  row('Numero de journee', report.journee_number != null ? String(report.journee_number) : '—');
  row('Ouverture', dtFr(report.opened_at));
  row('Fermeture', report.kind === 'X' ? 'En cours' : dtFr(report.closed_at));
  row('Date impression', dtFr(report.printed_at));

  rule();
  row('CA TOTAL', eur2(report.totals.ca_ttc), true);
  row('CA HT', eur2(report.totals.ca_ht));
  row('Ticket moyen TTC', eur2(report.totals.ticket_moyen_ttc));
  if (report.totals.marge_brute_ht != null) row('Marge brute HT', eur2(report.totals.marge_brute_ht));

  if (report.tva_by_rate.length > 0) {
    rule();
    for (const t of report.tva_by_rate) row(`TVA ${pct2(t.rate)} collectee`, eur2(t.tva));
    for (const t of report.tva_by_rate) row(`CA TTC ${pct2(t.rate)}`, eur2(t.ttc));
    for (const t of report.tva_by_rate) row(`CA HT ${pct2(t.rate)}`, eur2(t.ht));
  }

  rule();
  row('Total reduction', `-${eur2(report.totals.discounts_total)}`);
  row('Total offerts', eur2(report.totals.offerts_total));
  row("Nombre d'offerts", String(report.totals.offerts_count));

  rule();
  center('Modes de reglement', true);
  for (const p of report.payments) {
    const label = PAYMENT_LABELS[p.method] ?? p.method;
    row(`${label} [${p.count}]`, eur2(p.amount));
  }

  rule();
  center("Entrees d'argent / especes", true);
  if (report.cash.entrees_argent > 0) row("Entrees d'argent", eur2(report.cash.entrees_argent));
  row('Fonds de caisse', eur2(report.cash.fonds_de_caisse));
  row('Total espece a la fermeture', eur2(report.cash.total_espece_fermeture));
  if (report.cash.counted != null) {
    row('Especes comptees', eur2(report.cash.counted));
    const v = report.cash.variance ?? 0;
    row(v === 0 ? 'Ecart' : v > 0 ? 'Surplus' : 'Manquant', `${v >= 0 ? '+' : ''}${eur2(v)}`);
  }
  row('Ouverture tiroir sans ticket', String(report.cash.tiroir_sans_ticket));

  if (report.by_vendor.length > 0) {
    rule();
    center('Donnees par vendeur', true);
    for (const v of report.by_vendor) row(v.name, eur2(v.ca_ttc));
  }
  if (report.by_category.length > 0) {
    rule();
    center('CA TTC Familles', true);
    for (const c of report.by_category) row(c.name, eur2(c.ca_ttc));
  }
  if (report.by_mode.length > 0) {
    rule();
    center('CA TTC Modes de ventes', true);
    for (const m of report.by_mode) row(m.mode, eur2(m.ca_ttc));
  }

  rule();
  center('Nombre de tickets', true);
  row('Tickets normal', String(report.tickets.normal_count));
  row('Total ticket NORMAL', eur2(report.tickets.normal_total));

  if (report.kind === 'Z' && report.fiscal_hash) {
    rule();
    if (report.closed_by) row('Cloturee par', report.closed_by);
    left('Empreinte fiscale :');
    left(report.fiscal_hash);
  }

  feedAndCut(enc);
  return Buffer.from(enc.encode());
}

export interface BankDepositData {
  id?: string;
  movement_type: 'in' | 'out';
  amount: number;
  reason: string;
  created_at: string;
  user_name: string;
  store_name: string;
  register_code: string;
  org_name: string;
}

/** Reçu de remise en banque / mouvement de caisse (StarPRNT). */
export async function buildBankDepositStarPrnt(
  m: BankDepositData,
  settings: ReceiptSettings | null,
  paperWidthMm?: number,
): Promise<Buffer> {
  const W = columns(paperWidthMm);
  const enc = await newEncoder(W);
  const { center, left, rule, row } = layout(enc, W);
  const isBankDeposit = m.movement_type === 'out' && /banque/i.test(m.reason);

  await printShopName(enc, settings?.shop_name?.trim() || m.org_name, paperWidthMm);
  if (settings?.address_line1) center(settings.address_line1);
  if (settings?.address_zip_city) center(settings.address_zip_city);
  if (settings?.siret) center(`SIRET ${settings.siret}`);

  rule();
  center(isBankDeposit ? 'REMISE EN BANQUE' : (m.movement_type === 'out' ? 'SORTIE CAISSE' : 'ENTREE CAISSE'), true);
  rule();
  const d = new Date(m.created_at);
  row('Date', d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }));
  row('Heure', d.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' }));
  row('Boutique', m.store_name);
  row('Caisse', m.register_code);
  row('Vendeur', m.user_name);
  row('Motif', m.reason);
  rule();
  row('MONTANT', `${m.movement_type === 'out' ? '-' : '+'} ${eur2(m.amount)}`, true);

  if (isBankDeposit) {
    enc.newline();
    center('Conserver ce recu avec le bordereau de remise.');
    left('Signature : ______________________');
  }
  enc.newline();
  center(m.id ? `Reference ${m.id.slice(0, 8)}` : 'Recu de caisse');
  feedAndCut(enc);
  return Buffer.from(enc.encode());
}
