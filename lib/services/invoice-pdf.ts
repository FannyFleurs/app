import PDFDocument from 'pdfkit';
import { formatEUR } from './money';

export interface InvoicePdfData {
  number: string;
  invoice_type: string;
  status: string;
  issue_date: string;
  service_date: string | null;
  due_date: string | null;
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  tva_breakdown: { rate: number; base_ht: number; tva: number; ttc: number }[];
  payment_terms: string | null;
  legal_mentions: string | null;
  lines: Array<{
    label: string;
    quantity: number;
    unit_price_ht: number;
    discount_pct: number;
    tax_rate: number;
    line_ht: number;
    line_tva: number;
    line_ttc: number;
  }>;
  fiscal_hash: string | null;
}

export interface InvoicePartyInfo {
  name: string;
  legal_name?: string;
  siret?: string | null;
  vat_number?: string | null;
  address?: { line1?: string; zip?: string; city?: string } | null;
  email?: string | null;
  phone?: string | null;
}

export async function renderInvoicePdf(
  invoice: InvoicePdfData,
  emitter: InvoicePartyInfo,
  customer: InvoicePartyInfo,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (b: Buffer) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Bandeau
    doc.font('Helvetica-Bold').fontSize(22).text('FACTURE', 48, 48);
    doc.font('Helvetica').fontSize(10).fillColor('#666');
    doc.text(invoice.number, 48, 75);
    doc.fillColor('#000');

    // Bloc émetteur (gauche)
    const blockY = 110;
    doc.font('Helvetica-Bold').fontSize(11).text(emitter.name, 48, blockY);
    doc.font('Helvetica').fontSize(9);
    if (emitter.legal_name && emitter.legal_name !== emitter.name) doc.text(emitter.legal_name);
    if (emitter.address?.line1) doc.text(emitter.address.line1);
    if (emitter.address?.zip || emitter.address?.city) doc.text(`${emitter.address?.zip ?? ''} ${emitter.address?.city ?? ''}`.trim());
    if (emitter.email) doc.text(emitter.email);
    if (emitter.phone) doc.text(emitter.phone);
    doc.moveDown(0.3);
    if (emitter.siret) doc.text(`SIRET ${emitter.siret}`);
    if (emitter.vat_number) doc.text(`TVA intra. ${emitter.vat_number}`);

    // Bloc client (droite)
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#666').text('FACTURÉ À', 340, blockY);
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(11).text(customer.name, 340, blockY + 14);
    doc.font('Helvetica').fontSize(9);
    if (customer.address?.line1) doc.text(customer.address.line1, 340, doc.y);
    if (customer.address?.zip || customer.address?.city) doc.text(`${customer.address?.zip ?? ''} ${customer.address?.city ?? ''}`.trim(), 340, doc.y);
    if (customer.siret) doc.text(`SIRET ${customer.siret}`, 340, doc.y);
    if (customer.vat_number) doc.text(`TVA intra. ${customer.vat_number}`, 340, doc.y);

    // Méta facture (dates)
    const metaY = 220;
    doc.font('Helvetica').fontSize(9).fillColor('#666');
    doc.text('Date d\'émission', 48, metaY);
    doc.text('Date de prestation', 200, metaY);
    if (invoice.due_date) doc.text('Échéance', 350, metaY);
    doc.fillColor('#000').font('Helvetica-Bold');
    doc.text(invoice.issue_date, 48, metaY + 12);
    doc.text(invoice.service_date ?? '—', 200, metaY + 12);
    if (invoice.due_date) doc.text(invoice.due_date, 350, metaY + 12);

    // Table des lignes
    const tableTop = 270;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#666');
    doc.text('DÉSIGNATION', 48, tableTop);
    doc.text('QTÉ', 340, tableTop, { width: 30, align: 'right' });
    doc.text('PU HT', 375, tableTop, { width: 50, align: 'right' });
    doc.text('TVA', 430, tableTop, { width: 25, align: 'right' });
    doc.text('TOTAL HT', 460, tableTop, { width: 80, align: 'right' });

    drawHr(doc, tableTop + 14);

    doc.fillColor('#000').font('Helvetica').fontSize(9);
    let y = tableTop + 22;
    for (const l of invoice.lines) {
      const startY = y;
      doc.text(l.label, 48, y, { width: 280 });
      const h = Math.max(doc.y - startY, 12);
      doc.text(String(l.quantity), 340, startY, { width: 30, align: 'right' });
      doc.text(formatEUR(l.unit_price_ht), 375, startY, { width: 50, align: 'right' });
      doc.text(`${l.tax_rate}%`, 430, startY, { width: 25, align: 'right' });
      doc.text(formatEUR(l.line_ht), 460, startY, { width: 80, align: 'right' });
      y = startY + h + 4;
      if (y > 700) { doc.addPage(); y = 50; }
    }

    drawHr(doc, y);
    y += 12;

    // Totaux à droite
    doc.font('Helvetica').fontSize(10);
    const totalsX = 340;
    const labelW = 100;
    const valueX = 460;
    const valueW = 80;

    doc.text('Total HT', totalsX, y, { width: labelW });
    doc.text(formatEUR(invoice.total_ht), valueX, y, { width: valueW, align: 'right' });
    y += 14;

    for (const t of invoice.tva_breakdown) {
      doc.fillColor('#666').text(`TVA ${t.rate}%`, totalsX, y, { width: labelW });
      doc.fillColor('#000').text(formatEUR(t.tva), valueX, y, { width: valueW, align: 'right' });
      y += 13;
    }

    doc.fillColor('#000').text('Total TVA', totalsX, y, { width: labelW });
    doc.text(formatEUR(invoice.total_tva), valueX, y, { width: valueW, align: 'right' });
    y += 14;

    drawHr(doc, y);
    y += 8;

    doc.font('Helvetica-Bold').fontSize(13);
    doc.text('TOTAL TTC', totalsX, y, { width: labelW });
    doc.text(formatEUR(invoice.total_ttc), valueX, y, { width: valueW, align: 'right' });
    y += 28;

    // Conditions
    if (invoice.payment_terms) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#666').text('CONDITIONS DE RÈGLEMENT', 48, y);
      doc.fillColor('#000').font('Helvetica').fontSize(9).text(invoice.payment_terms, 48, y + 12, { width: 480 });
      y = doc.y + 10;
    }

    if (invoice.status === 'paid') {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#2F6B3F')
         .text('FACTURE ACQUITTÉE', 48, y);
      doc.fillColor('#000');
      y += 16;
    }

    // Mentions légales
    if (invoice.legal_mentions) {
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#666')
         .text(invoice.legal_mentions, 48, y, { width: 480, align: 'justify' });
      doc.fillColor('#000');
    }

    // Pied : empreinte fiscale
    if (invoice.fiscal_hash) {
      doc.font('Helvetica-Oblique').fontSize(7).fillColor('#888').text(
        `Empreinte fiscale : ${invoice.fiscal_hash} · Système conforme aux exigences d'inaltérabilité (art. 286, I, 3°bis du CGI).`,
        48, 780, { width: 500, align: 'center' },
      );
      doc.fillColor('#000');
    }

    doc.end();
  });
}

function drawHr(doc: PDFKit.PDFDocument, y: number) {
  doc.moveTo(48, y).lineTo(548, y).strokeColor('#DDD').lineWidth(0.5).stroke().strokeColor('#000');
}
