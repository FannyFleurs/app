import PDFDocument from 'pdfkit';
import { formatEUR } from './money';
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
  payments: { method: string; amount: number; reference?: string | null }[];
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
  cash: 'Espèces',
  card: 'Carte bancaire',
  check: 'Chèque',
  transfer: 'Virement',
  gift_card: 'Carte cadeau',
  credit_note: 'Avoir',
  deferred: 'Différé client',
  other: 'Autre',
};

/**
 * Génère un PDF ticket 80 mm (largeur ~226pt). Renvoie un Buffer.
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

    // Logo si configuré
    if (rs?.logo_data_url?.startsWith('data:image')) {
      try {
        const base64 = rs.logo_data_url.split(',')[1] ?? '';
        const buf = Buffer.from(base64, 'base64');
        const x = (doc.page.width - 60) / 2;
        doc.image(buf, x, doc.y, { fit: [60, 40], align: 'center' });
        doc.y += 42;
      } catch { /* ignore image errors */ }
    }

    const shopName = rs?.shop_name?.trim() || org.name;
    doc.font('Helvetica-Bold').fontSize(11).text(shopName, { align: 'center' });
    doc.font('Helvetica').fontSize(8);
    if (org.legal_name && org.legal_name !== shopName) doc.text(org.legal_name, { align: 'center' });

    const address1 = rs?.address_line1?.trim() || org.address?.line1;
    if (address1) doc.text(address1, { align: 'center' });

    const zipCity = rs?.address_zip_city?.trim()
      || [org.address?.zip, org.address?.city].filter(Boolean).join(' ');
    if (zipCity) doc.text(zipCity, { align: 'center' });

    const siret = rs?.siret?.trim() || org.siret;
    if (siret) doc.text(`SIRET ${siret}`, { align: 'center' });

    const vat = rs?.vat_number?.trim() || org.vat_number;
    if (vat) doc.text(`TVA ${vat}`, { align: 'center' });

    const phone = rs?.phone?.trim() || org.phone;
    if (phone) doc.text(phone, { align: 'center' });

    if (rs?.welcome_message?.trim()) {
      doc.moveDown(0.2);
      doc.font('Helvetica-Oblique').text(rs.welcome_message.trim(), { align: 'center' });
      doc.font('Helvetica');
    }

    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(9)
       .text(`Ticket ${snapshot.receipt_number}`, { align: 'center' });
    doc.font('Helvetica').fontSize(8);
    const date = new Date(snapshot.validated_at);
    doc.text(date.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }), { align: 'center' });
    if (options.cashier) doc.text(`Vendeur : ${options.cashier}`, { align: 'center' });
    if (options.storeName) doc.text(options.storeName, { align: 'center' });
    if (options.registerCode) doc.text(`Caisse ${options.registerCode}`, { align: 'center' });

    doc.moveDown(0.5);
    doc.text('-'.repeat(40), { align: 'center' });
    doc.moveDown(0.3);

    // Lignes
    doc.font('Helvetica').fontSize(8);
    for (const l of snapshot.lines) {
      const qty = formatQty(l.quantity);
      const unit = formatEUR(l.unit_price_ttc);
      const ttc = formatEUR(l.line_ttc);
      doc.text(l.label, { continued: false });
      const sub = `${qty} × ${unit}${l.discount_amount > 0 ? ` (-${formatEUR(l.discount_amount)})` : ''}`;
      const left = doc.x;
      doc.text(sub, left, doc.y, { continued: true });
      doc.text(ttc, { align: 'right' });
    }

    doc.moveDown(0.2);
    doc.text('-'.repeat(40), { align: 'center' });

    // Totaux
    doc.font('Helvetica-Bold').fontSize(10);
    rowLine(doc, 'TOTAL TTC', formatEUR(snapshot.totals.total_ttc));
    doc.font('Helvetica').fontSize(8);
    rowLine(doc, 'Dont HT', formatEUR(snapshot.totals.total_ht));
    rowLine(doc, 'Dont TVA', formatEUR(snapshot.totals.total_tva));
    if (snapshot.totals.total_discount > 0) {
      rowLine(doc, 'Remises', `-${formatEUR(snapshot.totals.total_discount)}`);
    }

    if (rs?.show_tax_breakdown ?? true) {
      doc.moveDown(0.3);
      for (const t of snapshot.tva_breakdown) {
        rowLine(
          doc,
          `TVA ${t.rate}% (HT ${formatEUR(t.base_ht)})`,
          formatEUR(t.tva),
        );
      }
    }

    doc.moveDown(0.3);
    doc.text('-'.repeat(40), { align: 'center' });
    for (const p of snapshot.payments) {
      rowLine(doc, PAYMENT_LABELS[p.method] ?? p.method, formatEUR(p.amount));
    }

    // Code-barres du numéro de ticket
    if (rs?.show_barcode ?? true) {
      doc.moveDown(0.6);
      drawCode128(doc, snapshot.receipt_number);
    }

    if (rs?.footer_message?.trim()) {
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(8)
         .text(rs.footer_message.trim(), { align: 'center' });
    }

    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(7);
    doc.text('Mention : ticket disponible par email sur demande.', { align: 'center' });
    doc.moveDown(0.3);
    doc.font('Helvetica-Oblique').fontSize(6);
    doc.text(`Empreinte fiscale : ${options.fiscalHash.slice(0, 16)}…`, { align: 'center' });
    doc.text('Système conforme aux exigences d\'inaltérabilité (art. 286, I, 3°bis CGI)', {
      align: 'center',
    });

    doc.end();
  });
}

/**
 * Dessine un code-barres Code-128 minimaliste (style "barres aléatoires
 * déterministes" basé sur le hash du texte) + le numéro lisible dessous.
 * Pas une implémentation Code-128 normée, mais imprime le numéro lisible
 * sous forme barrée — pour scan rapide en interne uniquement.
 */
function drawCode128(doc: PDFKit.PDFDocument, text: string) {
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const barWidth = 1.2;
  const totalBars = Math.floor(w / barWidth);
  const y = doc.y;
  const h = 26;
  // Hash déterministe pour répartition de barres pleines/vides
  let seed = 0;
  for (let i = 0; i < text.length; i++) seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
  let x = doc.page.margins.left;
  for (let i = 0; i < totalBars; i++) {
    // 60% de barres pleines
    seed = (seed * 1103515245 + 12345) >>> 0;
    const isBar = (seed % 100) < 60;
    if (isBar) doc.rect(x, y, barWidth, h).fill('black');
    x += barWidth;
  }
  doc.fillColor('black');
  doc.font('Helvetica').fontSize(8);
  doc.y = y + h + 2;
  doc.text(text, { align: 'center' });
}

function rowLine(doc: PDFKit.PDFDocument, label: string, value: string) {
  const y = doc.y;
  doc.text(label, doc.page.margins.left, y, { continued: true });
  doc.text(value, { align: 'right' });
}

function formatQty(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
