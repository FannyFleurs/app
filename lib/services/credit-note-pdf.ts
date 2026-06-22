import PDFDocument from 'pdfkit';
import { formatEUR } from './money';

export interface CreditNotePdfData {
  number: string;
  amount: number;
  reason: string;
  status: string;
  refund_method: string;
  is_full_return: boolean;
  issued_at: string;
  fiscal_hash: string;
  origin_receipt_number: string | null;
  lines: Array<{ label: string; quantity: number; refunded_ttc: number; tax_rate: number }>;
}

export interface PartyInfo {
  name: string;
  legal_name?: string;
  siret?: string | null;
  vat_number?: string | null;
  address?: { line1?: string; zip?: string; city?: string } | null;
}

export async function renderCreditNotePdf(
  data: CreditNotePdfData,
  emitter: PartyInfo,
  customer?: PartyInfo | null,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (b: Buffer) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Bandeau rouge "AVOIR"
    doc.rect(48, 48, 500, 36).fillColor('#B42318').fill();
    doc.fillColor('white').font('Helvetica-Bold').fontSize(22).text('AVOIR', 60, 56);
    doc.fontSize(11).text(data.number, 60, 70);
    doc.fillColor('#000');

    // Bloc émetteur
    let y = 110;
    doc.font('Helvetica-Bold').fontSize(11).text(emitter.name, 48, y);
    doc.font('Helvetica').fontSize(9);
    if (emitter.legal_name && emitter.legal_name !== emitter.name) doc.text(emitter.legal_name);
    if (emitter.address?.line1) doc.text(emitter.address.line1);
    if (emitter.address?.zip || emitter.address?.city) {
      doc.text(`${emitter.address?.zip ?? ''} ${emitter.address?.city ?? ''}`.trim());
    }
    if (emitter.siret) doc.text(`SIRET ${emitter.siret}`);
    if (emitter.vat_number) doc.text(`TVA intra. ${emitter.vat_number}`);

    // Bloc client si fourni
    if (customer) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#666').text('À L\'ATTENTION DE', 340, 110);
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(11).text(customer.name, 340, 124);
      doc.font('Helvetica').fontSize(9);
      if (customer.address?.line1) doc.text(customer.address.line1, 340, doc.y);
      if (customer.address?.zip || customer.address?.city) {
        doc.text(`${customer.address?.zip ?? ''} ${customer.address?.city ?? ''}`.trim(), 340, doc.y);
      }
      if (customer.siret) doc.text(`SIRET ${customer.siret}`, 340, doc.y);
    }

    // Méta
    y = 220;
    doc.font('Helvetica').fontSize(9).fillColor('#666');
    doc.text('Date d\'émission', 48, y);
    doc.text('Ticket d\'origine', 200, y);
    doc.text('Statut', 360, y);
    doc.fillColor('#000').font('Helvetica-Bold');
    doc.text(new Date(data.issued_at).toLocaleDateString('fr-FR'), 48, y + 12);
    doc.text(data.origin_receipt_number ?? '—', 200, y + 12);
    doc.text(data.is_full_return ? 'Retour total' : 'Retour partiel', 360, y + 12);

    // Motif
    y = 260;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#666').text('MOTIF DU RETOUR', 48, y);
    doc.fillColor('#000').font('Helvetica').fontSize(10).text(data.reason, 48, y + 12, { width: 500 });

    // Table des lignes
    y = doc.y + 20;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#666');
    doc.text('DÉSIGNATION', 48, y);
    doc.text('QTÉ', 360, y, { width: 40, align: 'right' });
    doc.text('TVA', 410, y, { width: 30, align: 'right' });
    doc.text('MONTANT TTC', 460, y, { width: 80, align: 'right' });
    drawHr(doc, y + 14);

    doc.fillColor('#000').font('Helvetica').fontSize(9);
    y = y + 22;
    for (const l of data.lines) {
      doc.text(l.label, 48, y, { width: 300 });
      doc.text(String(l.quantity), 360, y, { width: 40, align: 'right' });
      doc.text(`${l.tax_rate}%`, 410, y, { width: 30, align: 'right' });
      doc.text(`-${formatEUR(l.refunded_ttc)}`, 460, y, { width: 80, align: 'right' });
      y += 18;
    }

    drawHr(doc, y);
    y += 12;

    // Total
    doc.font('Helvetica-Bold').fontSize(14);
    doc.text('TOTAL DE L\'AVOIR', 340, y, { width: 120 });
    doc.fillColor('#B42318').text(`-${formatEUR(data.amount)}`, 460, y, { width: 80, align: 'right' });
    doc.fillColor('#000');
    y += 28;

    // Note
    if (data.refund_method === 'cash') {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#2F6B3F')
         .text(`REMBOURSÉ EN ESPÈCES — ${formatEUR(data.amount)} sorti de la caisse`, 48, y);
      doc.fillColor('#000');
    } else {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1F3A5F')
         .text(`AVOIR UTILISABLE POUR UN ACHAT ULTÉRIEUR`, 48, y);
      doc.fillColor('#000');
      doc.font('Helvetica').fontSize(9).text(
        `Présentez ce document lors d'un prochain passage en caisse : la référence ${data.number} permettra de l'utiliser comme moyen de paiement à concurrence de ${formatEUR(data.amount)}.`,
        48, y + 14, { width: 500 },
      );
    }

    // Pied
    doc.font('Helvetica-Oblique').fontSize(7).fillColor('#888').text(
      `Empreinte fiscale : ${data.fiscal_hash} · Système conforme aux exigences d'inaltérabilité (art. 286, I, 3°bis du CGI).`,
      48, 780, { width: 500, align: 'center' },
    );
    doc.fillColor('#000');

    doc.end();
  });
}

function drawHr(doc: PDFKit.PDFDocument, y: number) {
  doc.moveTo(48, y).lineTo(548, y).strokeColor('#DDD').lineWidth(0.5).stroke().strokeColor('#000');
}
