import PDFDocument from 'pdfkit';
import { round2 } from './money';
import type { ReceiptSettings } from '@/lib/settings/receipt';

export interface ReceiptSnapshot {
  receipt_number: string;
  validated_at: string;
  totals: {
    total_ht: number;
    total_tva: number;
    total_ttc: number;
    total_discount: number;
  };
  tva_breakdown: { rate: number; base_ht: number; tva: number; ttc: number }[];
  lines: Array<{
    label: string;
    unit_price_ttc: number;
    quantity: number;
    discount_amount: number;
    tax_rate: number;
    line_ttc: number;
  }>;
  payments: { method: string; amount: number; given_amount?: number | null; reference?: string | null }[];
}

export interface OrgInfo {
  name: string;
  legal_name: string;
  siret?: string | null;
  vat_number?: string | null;
  address?: { line1?: string; zip?: string; city?: string; country?: string } | null;
  phone?: string | null;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Especes',
  card: 'Carte Bancaire',
  check: 'Cheque',
  transfer: 'Virement',
  gift_card: 'Carte cadeau',
  credit_note: 'Avoir',
  deferred: 'En compte',
  other: 'Autre',
};

// Police thermique = monospace (Courier). Largeur utile ~40 caractères à 8.5pt
// sur 80 mm (226pt - marges) : rendu « ticket de caisse » fidèle aux exemples.
const MONO = 'Courier';
const MONO_B = 'Courier-Bold';
const W = 40;

/** Montant « 8,30 » / « -10,74 » (virgule décimale, 2 décimales). */
function n2(x: number): string {
  return x.toFixed(2).replace('.', ',');
}
/** Montant suffixé « 8,30 EUR ». */
function eur(x: number): string {
  return `${n2(x)} EUR`;
}

/**
 * Génère un PDF ticket 80 mm (largeur ~226pt), rendu monospace « thermique ».
 * Aucune logique fiscale ici : on lit uniquement le snapshot figé.
 */
export async function renderReceiptPdf(
  snapshot: ReceiptSnapshot,
  org: OrgInfo,
  options: {
    fiscalHash: string;
    storeName?: string;
    registerCode?: string;
    cashier?: string;
    receipt?: ReceiptSettings;
    /** Ticket « sans prix » (bon d'échange) : liste quantité + désignation,
     *  sans aucun montant, sans totaux/TVA/paiements. */
    giftReceipt?: boolean;
    /** Ticket sans prix : positions (0-based) des lignes à imprimer. Si absent
     *  ou vide, toutes les lignes sont imprimées. */
    giftLineIndices?: number[] | null;
    /** Nom du client rattaché (affiché avec les points de fidélité). */
    customerName?: string | null;
    /** Fidélité au moment de la vente : points gagnés sur ce ticket +
     *  solde du compte après la vente (figé via loyalty_movements). */
    loyalty?: { earned: number; balance: number; redeemed: number } | null;
  },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [226, 1200],
      margins: { top: 12, bottom: 12, left: 10, right: 10 },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (b: Buffer) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const rs = options.receipt;
    const gift = options.giftReceipt === true;

    // Helpers de mise en page monospace.
    const setFont = (bold = false, size = 8.5) => doc.font(bold ? MONO_B : MONO).fontSize(size);
    const rule = () => { setFont(); doc.text('-'.repeat(W), { align: 'center' }); };
    const center = (t: string, bold = false, size = 8.5) => { setFont(bold, size); doc.text(t, { align: 'center' }); };
    // Ligne « libellé ......... valeur » occupant toute la largeur.
    const row = (left: string, right: string, bold = false) => {
      setFont(bold);
      const gap = Math.max(1, W - left.length - right.length);
      doc.text(left + ' '.repeat(gap) + right);
      setFont();
    };
    // Ligne article : désignation à gauche, prix aligné à droite (gère le
    // retour à la ligne des libellés longs).
    const itemRow = (left: string, right: string) => {
      setFont();
      doc.text(left, doc.page.margins.left, doc.y, { continued: true });
      doc.text(right, { align: 'right' });
    };

    // ---- Logo éventuel ----
    if (rs?.logo_data_url?.startsWith('data:image')) {
      try {
        const base64 = rs.logo_data_url.split(',')[1] ?? '';
        const buf = Buffer.from(base64, 'base64');
        const x = (doc.page.width - 60) / 2;
        doc.image(buf, x, doc.y, { fit: [60, 40], align: 'center' });
        doc.y += 42;
      } catch { /* ignore image errors */ }
    }

    // ---- En-tête : NOM DE LA BOUTIQUE + coordonnées ----
    center(rs?.shop_name?.trim() || org.name, true, 11);
    const address1 = rs?.address_line1?.trim() || org.address?.line1;
    if (address1) center(address1);
    const zipCity = rs?.address_zip_city?.trim()
      || [org.address?.zip, org.address?.city].filter(Boolean).join(' ');
    if (zipCity) center(zipCity);
    const phone = rs?.phone?.trim() || org.phone;            // téléphone AVANT le SIRET
    if (phone) center(phone);
    const siret = rs?.siret?.trim() || org.siret;
    if (siret) center(`Siret : ${siret}`);
    const vat = rs?.vat_number?.trim() || org.vat_number;
    if (vat) center(`TVA : ${vat}`);
    const website = rs?.website?.trim();                     // site web propre à la boutique
    if (website) center(website);

    rule();

    // ---- Bloc ticket : n° + type + date ----
    center(`Ticket ${snapshot.receipt_number}${gift ? '' : ' - VENTE'}`);
    if (gift) center('TICKET SANS PRIX', true, 10);
    const date = new Date(snapshot.validated_at);
    center(date.toLocaleString('fr-FR', {
      timeZone: 'Europe/Paris',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));

    rule();

    // ---- Vendeur (nom de boutique + n° de caisse volontairement absents :
    //      la boutique figure déjà en en-tête) ----
    if (options.cashier) { setFont(); doc.text(`Servis par: ${options.cashier}`); }

    rule();

    // ---- Codes TVA : A = taux le plus élevé, puis B, C… ----
    const rates = [...new Set(snapshot.tva_breakdown.map((t) => t.rate))].sort((a, b) => b - a);
    const codeOf = new Map(rates.map((r, i) => [r, String.fromCharCode(65 + i)]));

    // ---- Lignes ----
    if (gift) {
      const sel = options.giftLineIndices;
      const giftLines = sel && sel.length
        ? snapshot.lines.filter((_, i) => sel.includes(i))
        : snapshot.lines;
      setFont(true); doc.text('QTE DESC');
      setFont();
      for (const l of giftLines) doc.text(`${formatQty(l.quantity)} ${l.label}`);
    } else {
      row('QTE DESC', 'PU   EUR', true);
      for (const l of snapshot.lines) {
        const gross = round2(l.unit_price_ttc * l.quantity);
        const code = codeOf.get(l.tax_rate) ?? '';
        itemRow(`${formatQty(l.quantity)} ${l.label}`, `${n2(l.unit_price_ttc)} ${n2(gross)} ${code}`);
        if (l.discount_amount > 0) {
          const pct = gross > 0 ? (l.discount_amount / gross) * 100 : 0;
          row(`  Remise ${formatPct(pct)}`, `-${n2(l.discount_amount)}`);
        }
      }
    }

    rule();

    // ---- Totaux / paiements / TVA / fidélité : ticket avec prix uniquement ----
    if (!gift) {
      if (snapshot.totals.total_discount > 0) {
        const gross = round2(snapshot.totals.total_ttc + snapshot.totals.total_discount);
        row('Sous total :', eur(gross));
        row('Reduction lignes :', `-${eur(snapshot.totals.total_discount)}`);
      }
      row('Total:', eur(snapshot.totals.total_ttc), true);

      rule();

      // Règlements. Espèces avec sur-paiement → montant DONNÉ puis « Rendu ».
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
      if (change > 0) row('Rendu', eur(change));

      rule();

      // ---- Détail TVA (tableau colonnes) ----
      if ((rs?.show_tax_breakdown ?? true) && snapshot.tva_breakdown.length > 0) {
        const padL = (s: string, n: number) => s.padStart(n);
        setFont();
        doc.text('  ' + padL('TVA %', 7) + padL('Taxe', 9) + padL('HTVA', 9) + padL('TVAC', 9));
        for (const t of snapshot.tva_breakdown) {
          const code = codeOf.get(t.rate) ?? ' ';
          doc.text(code.padEnd(2) + padL(n2(t.rate), 7) + padL(n2(t.tva), 9) + padL(n2(t.base_ht), 9) + padL(n2(t.ttc), 9));
        }
        doc.text('  ' + padL('Total', 7)
          + padL(n2(snapshot.totals.total_tva), 9)
          + padL(n2(snapshot.totals.total_ht), 9)
          + padL(n2(snapshot.totals.total_ttc), 9));
        rule();
      }

      // ---- Client + fidélité ----
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

      // ---- Compteurs ----
      const totalQty = snapshot.lines.reduce((s, l) => s + l.quantity, 0);
      row('Nombre de produit :', formatQty(totalQty));
      row('Nombre de ligne :', String(snapshot.lines.length));

      rule();
    }

    // ---- Code-barres du numéro de ticket ----
    if (rs?.show_barcode ?? true) {
      doc.moveDown(0.4);
      drawCode128(doc, snapshot.receipt_number);
    }

    // ---- Mentions fiscales (ticket avec prix uniquement) ----
    if (!gift) {
      doc.moveDown(0.4);
      setFont(false, 7);
      doc.text('Ticket disponible par email sur demande.', { align: 'center' });
      doc.text(`Empreinte fiscale : ${options.fiscalHash.slice(0, 16)}...`, { align: 'center' });
      doc.text('Systeme conforme (art. 286, I, 3 bis CGI)', { align: 'center' });
    }

    // ---- Messages personnalisés TOUT EN BAS (pied de page puis remerciement) ----
    if (rs?.footer_message?.trim()) {
      doc.moveDown(0.4);
      setFont();
      doc.text(rs.footer_message.trim(), { align: 'center' });
    }
    if (rs?.welcome_message?.trim()) {
      doc.moveDown(0.3);
      center(rs.welcome_message.trim());
    }

    doc.end();
  });
}

/**
 * Dessine un code-barres Code-128 minimaliste (barres déterministes basées sur
 * le hash du texte) + le numéro lisible dessous. Pas une implémentation
 * Code-128 normée — pour repérage rapide interne uniquement.
 */
function drawCode128(doc: PDFKit.PDFDocument, text: string) {
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const barWidth = 1.2;
  const totalBars = Math.floor(w / barWidth);
  const y = doc.y;
  const h = 26;
  let seed = 0;
  for (let i = 0; i < text.length; i++) seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
  let x = doc.page.margins.left;
  for (let i = 0; i < totalBars; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const isBar = (seed % 100) < 60;
    if (isBar) doc.rect(x, y, barWidth, h).fill('black');
    x += barWidth;
  }
  doc.fillColor('black');
  doc.font(MONO).fontSize(8);
  doc.y = y + h + 2;
  doc.text(text, { align: 'center' });
}

function formatQty(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

/** Pourcentage de remise formaté « 30 % » / « 12,5 % » (sans décimales inutiles). */
function formatPct(p: number): string {
  const s = Number.isInteger(p) ? String(p) : p.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${s.replace('.', ',')} %`;
}
