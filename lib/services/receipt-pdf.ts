import PDFDocument from 'pdfkit';
import { formatEUR } from './money';

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
  options: { fiscalHash: string; storeName?: string; registerCode?: string; cashier?: string },
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

    doc.font('Helvetica-Bold').fontSize(11).text(org.name, { align: 'center' });
    doc.font('Helvetica').fontSize(8);
    if (org.legal_name && org.legal_name !== org.name) doc.text(org.legal_name, { align: 'center' });
    if (org.address?.line1) doc.text(org.address.line1, { align: 'center' });
    if (org.address?.zip || org.address?.city) {
      doc.text(`${org.address.zip ?? ''} ${org.address.city ?? ''}`.trim(), { align: 'center' });
    }
    if (org.siret) doc.text(`SIRET ${org.siret}`, { align: 'center' });
    if (org.vat_number) doc.text(`TVA ${org.vat_number}`, { align: 'center' });
    if (org.phone) doc.text(org.phone, { align: 'center' });

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

    doc.moveDown(0.3);
    for (const t of snapshot.tva_breakdown) {
      rowLine(
        doc,
        `TVA ${t.rate}% (HT ${formatEUR(t.base_ht)})`,
        formatEUR(t.tva),
      );
    }

    doc.moveDown(0.3);
    doc.text('-'.repeat(40), { align: 'center' });
    for (const p of snapshot.payments) {
      rowLine(doc, PAYMENT_LABELS[p.method] ?? p.method, formatEUR(p.amount));
    }

    doc.moveDown(0.6);
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

function rowLine(doc: PDFKit.PDFDocument, label: string, value: string) {
  const y = doc.y;
  doc.text(label, doc.page.margins.left, y, { continued: true });
  doc.text(value, { align: 'right' });
}

function formatQty(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
