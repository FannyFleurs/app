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

/** Largeur utile en caractères (80 mm, police A). */
const W = 42;

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Especes', card: 'Carte Bancaire', check: 'Cheque', transfer: 'Virement',
  gift_card: 'Carte cadeau', credit_note: 'Avoir', deferred: 'En compte', other: 'Autre',
};

const n2 = (x: number) => x.toFixed(2).replace('.', ',');
const eur = (x: number) => `${n2(x)} EUR`;
const qty = (q: number) => (Number.isInteger(q) ? String(q) : String(q).replace('.', ','));
/** Translittère en ASCII (les imprimantes thermiques gèrent mal les accents). */
const ascii = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '');
/** « libellé .... valeur » sur toute la largeur (tronque le libellé si besoin). */
function rowStr(left: string, right: string): string {
  const l = ascii(left); const r = ascii(right);
  const maxLeft = Math.max(0, W - r.length - 1);
  const lt = l.length > maxLeft ? l.slice(0, maxLeft) : l;
  const gap = Math.max(1, W - lt.length - r.length);
  return lt + ' '.repeat(gap) + r;
}
const padStart = (s: string, n: number) => ascii(s).padStart(n);

// Interface minimale de l'encodeur StarPRNT (les typings du paquet sont
// incomplets — pulse/bold/width/height/align/barcode manquent ou ne chaînent
// pas). On la déclare pour un typage + chaînage fiables.
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
  cut(): StarEnc;
  pulse(): StarEnc;
  encode(): Uint8Array;
}

async function newEncoder(): Promise<StarEnc> {
  const mod = await import('star-prnt-encoder');
  const StarPrntEncoder = mod.default as unknown as new (opts: Record<string, unknown>) => StarEnc;
  const enc = new StarPrntEncoder({});
  enc.initialize();
  return enc;
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
  enc.newline();
  enc.pulse(); // ouvre le tiroir en même temps que le ticket sort
  enc.cut();
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
  /** Ouvre le tiroir en même temps (ventes réglées en espèces). */
  openDrawer?: boolean;
}

/**
 * Ticket de vente complet en StarPRNT texte, calqué sur le PDF thermique :
 * en-tête boutique, lignes (QTE/DESC/PU), totaux, règlements + rendu, TVA,
 * fidélité, code-barres, mentions fiscales, messages de pied. Variante
 * « sans prix » (gift) : uniquement quantités + désignations.
 */
export async function buildReceiptStarPrnt(
  snapshot: ReceiptSnapshot,
  org: OrgInfo,
  options: ReceiptStarOptions,
): Promise<Buffer> {
  const enc = await newEncoder();
  const rs = options.receipt ?? null;
  const gift = options.giftReceipt === true;

  const center = (t: string, bold = false) => {
    enc.align('center'); if (bold) enc.bold(true);
    enc.line(ascii(t));
    if (bold) enc.bold(false); enc.align('left');
  };
  const left = (t = '') => { enc.align('left').line(ascii(t)); };
  const rule = () => { enc.align('left').line('-'.repeat(W)); };
  const row = (l: string, r: string, bold = false) => {
    enc.align('left'); if (bold) enc.bold(true);
    enc.line(rowStr(l, r));
    if (bold) enc.bold(false);
  };

  // En-tête boutique.
  enc.align('center').bold(true).width(2).height(2);
  enc.line(ascii(rs?.shop_name?.trim() || org.name));
  enc.width(1).height(1).bold(false);
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
    enc.bold(true).line('Commentaire :').bold(false);
    left(snapshot.comment.trim());
  }
  rule();

  // Codes TVA (A = taux le plus élevé…).
  const rates = [...new Set(snapshot.tva_breakdown.map((t) => t.rate))].sort((a, b) => b - a);
  const codeOf = new Map(rates.map((r, i) => [r, String.fromCharCode(65 + i)]));

  if (gift) {
    const sel = options.giftLineIndices;
    const giftLines = sel && sel.length
      ? snapshot.lines.filter((_, i) => sel.includes(i))
      : snapshot.lines;
    enc.bold(true).line('QTE DESC').bold(false);
    for (const l of giftLines) left(`${qty(l.quantity)} ${l.label}`);
  } else {
    row('QTE DESC', 'PU   EUR', true);
    for (const l of snapshot.lines) {
      const gross = round2(l.unit_price_ttc * l.quantity);
      const code = codeOf.get(l.tax_rate) ?? '';
      row(`${qty(l.quantity)} ${l.label}`, `${n2(l.unit_price_ttc)} ${n2(gross)} ${code}`);
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
    // Total en gros caractères (double largeur ⇒ ~21 col : pas de remplissage
    // pleine largeur, qui déborderait).
    enc.align('left').bold(true).width(2).height(2);
    enc.line(ascii(`TOTAL: ${eur(snapshot.totals.total_ttc)}`));
    enc.width(1).height(1).bold(false);
    rule();

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

    if ((rs?.show_tax_breakdown ?? true) && snapshot.tva_breakdown.length > 0) {
      left('  ' + padStart('TVA %', 7) + padStart('Taxe', 9) + padStart('HTVA', 9) + padStart('TVAC', 9));
      for (const t of snapshot.tva_breakdown) {
        const code = codeOf.get(t.rate) ?? ' ';
        left(code.padEnd(2) + padStart(n2(t.rate), 7) + padStart(n2(t.tva), 9)
          + padStart(n2(t.base_ht), 9) + padStart(n2(t.ttc), 9));
      }
      left('  ' + padStart('Total', 7) + padStart(n2(snapshot.totals.total_tva), 9)
        + padStart(n2(snapshot.totals.total_ht), 9) + padStart(n2(snapshot.totals.total_ttc), 9));
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
    enc.line(`Empreinte fiscale : ${ascii(options.fiscalHash.slice(0, 16))}...`);
    enc.line('Systeme conforme (art. 286, I, 3 bis CGI)');
    enc.align('left');
  }

  if (rs?.footer_message?.trim()) { enc.newline(); center(rs.footer_message.trim()); }
  if (rs?.welcome_message?.trim()) center(rs.welcome_message.trim());

  enc.newline();
  if (options.openDrawer) enc.pulse();
  enc.cut();
  return Buffer.from(enc.encode());
}
