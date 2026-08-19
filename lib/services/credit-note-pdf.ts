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

// Format ticket thermique 80 mm (et non A4) : l'avoir sort sur l'imprimante
// ticket comme un reçu. 80 mm ≈ 226,77 pt ; petites marges latérales.
const PAGE_W = 226.77;
const MARGIN = 12;
const CW = PAGE_W - MARGIN * 2;

/**
 * Dessine l'avoir en une colonne étroite (ticket). Retourne l'ordonnée finale,
 * qui sert à fixer la hauteur exacte de la page (aucune avance de papier vide).
 */
function drawAvoir(doc: PDFKit.PDFDocument, data: CreditNotePdfData, emitter: PartyInfo, customer?: PartyInfo | null): number {
  const x = MARGIN;
  let y = MARGIN;
  const center = (t: string, size = 8, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor('#000');
    doc.text(t, x, y, { width: CW, align: 'center' });
    y = doc.y;
  };
  const left = (t: string, size = 9, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor('#000');
    doc.text(t, x, y, { width: CW });
    y = doc.y;
  };
  const rule = () => {
    doc.moveTo(x, y + 2).lineTo(x + CW, y + 2).strokeColor('#999').lineWidth(0.5).stroke().strokeColor('#000');
    y += 7;
  };
  const row = (l: string, r: string, size = 9, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor('#000');
    const start = y;
    doc.text(l, x, start, { width: CW * 0.6 });
    const yl = doc.y;
    doc.text(r, x + CW * 0.6, start, { width: CW * 0.4, align: 'right' });
    y = Math.max(yl, doc.y);
  };

  // En-tête boutique
  center(emitter.name, 11, true);
  if (emitter.legal_name && emitter.legal_name !== emitter.name) center(emitter.legal_name, 8);
  if (emitter.address?.line1) center(emitter.address.line1, 8);
  const zc = [emitter.address?.zip, emitter.address?.city].filter(Boolean).join(' ');
  if (zc) center(zc, 8);
  if (emitter.siret) center(`SIRET ${emitter.siret}`, 8);
  if (emitter.vat_number) center(`TVA ${emitter.vat_number}`, 8);

  y += 4;
  rule();
  center('AVOIR', 14, true);
  center(data.number, 9);
  rule();

  row('Date', new Date(data.issued_at).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }));
  if (data.origin_receipt_number) row("Ticket d'origine", data.origin_receipt_number);
  row('Retour', data.is_full_return ? 'Total' : 'Partiel');
  if (customer?.name) row('Client', customer.name);
  if (data.reason) { left('Motif :', 8, true); left(data.reason, 9); }

  if (data.lines.length > 0) {
    rule();
    for (const l of data.lines) {
      const label = l.quantity > 1 ? `${l.label} x${l.quantity}` : l.label;
      row(label, `-${formatEUR(l.refunded_ttc)}`, 9);
    }
  }

  rule();
  row("MONTANT AVOIR", `-${formatEUR(data.amount)}`, 12, true);

  y += 4;
  if (data.refund_method === 'cash') {
    center(`Remboursé en espèces : ${formatEUR(data.amount)}`, 8, true);
  } else {
    center('À valoir sur un prochain achat.', 9);
    center('À conserver et présenter en caisse.', 8);
  }

  y += 6;
  doc.fillColor('#666');
  center(`Empreinte : ${data.fiscal_hash}`, 6);
  center('Conforme art. 286, I, 3°bis du CGI.', 6);
  doc.fillColor('#000');

  return y;
}

export async function renderCreditNotePdf(
  data: CreditNotePdfData,
  emitter: PartyInfo,
  customer?: PartyInfo | null,
): Promise<Buffer> {
  // Passe 1 — mesure de la hauteur du contenu (rendu jeté).
  const measure = new PDFDocument({ size: [PAGE_W, 5000], margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } });
  measure.on('data', () => { /* ignoré */ });
  measure.on('error', () => { /* ignoré */ });
  const contentHeight = drawAvoir(measure, data, emitter, customer) + MARGIN;
  measure.end();

  // Passe 2 — page à la hauteur exacte, pour ne pas dérouler de papier vide.
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [PAGE_W, Math.max(150, contentHeight)],
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (b: Buffer) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    drawAvoir(doc, data, emitter, customer);
    doc.end();
  });
}
