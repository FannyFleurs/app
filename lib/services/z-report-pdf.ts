import PDFDocument from 'pdfkit';
import { formatEUR } from './money';

export interface ZReportData {
  business_date: string;
  store_name: string;
  closed_by: string;
  sealed_at: string;
  fiscal_hash: string;
  totals: {
    total_sales: number;
    total_ht: number;
    total_tva: number;
    total_ttc: number;
    discounts_total: number;
  };
  tva_breakdown: { rate: number; base_ht: number; tva: number; ttc: number }[];
  payments_breakdown: { method: string; declared?: number; counted: number; variance?: number }[];
  cash: {
    expected: number;
    counted: number;
    variance: number;
    denomination_count?: Record<string, number>;
  };
}

export interface OrgInfoMinimal {
  name: string;
  legal_name: string;
  siret?: string | null;
  vat_number?: string | null;
  address?: { line1?: string; zip?: string; city?: string } | null;
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

const DENOMINATION_LABELS: Record<string, string> = {
  '500':  'Billet 500 €',
  '200':  'Billet 200 €',
  '100':  'Billet 100 €',
  '50':   'Billet 50 €',
  '20':   'Billet 20 €',
  '10':   'Billet 10 €',
  '5':    'Billet 5 €',
  '2':    'Pièce 2 €',
  '1':    'Pièce 1 €',
  '0.5':  'Pièce 0,50 €',
  '0.2':  'Pièce 0,20 €',
  '0.1':  'Pièce 0,10 €',
  '0.05': 'Pièce 0,05 €',
  '0.02': 'Pièce 0,02 €',
  '0.01': 'Pièce 0,01 €',
};

export async function renderZReportPdf(data: ZReportData, org: OrgInfoMinimal): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (b: Buffer) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Bandeau
    doc.font('Helvetica-Bold').fontSize(20).text('RAPPORT Z DE CLÔTURE', { align: 'center' });
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).fillColor('#666')
       .text('Document fiscal de clôture journalière — exemplaire conservé par l\'établissement', { align: 'center' });
    doc.fillColor('#000');

    // Bloc org
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(12).text(org.name);
    doc.font('Helvetica').fontSize(9);
    if (org.legal_name && org.legal_name !== org.name) doc.text(org.legal_name);
    if (org.address?.line1) doc.text(org.address.line1);
    if (org.address?.zip || org.address?.city) doc.text(`${org.address?.zip ?? ''} ${org.address?.city ?? ''}`.trim());
    if (org.siret) doc.text(`SIRET ${org.siret}`);
    if (org.vat_number) doc.text(`TVA intra. ${org.vat_number}`);

    // Bloc clôture
    doc.moveDown(0.8);
    drawHr(doc);
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(11).text('Identification de la clôture');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10);
    kv(doc, 'Date d\'opération', new Date(data.business_date).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }));
    kv(doc, 'Boutique', data.store_name);
    kv(doc, 'Clôturée par', data.closed_by);
    kv(doc, 'Scellée le', new Date(data.sealed_at).toLocaleString('fr-FR'));

    // Totaux
    doc.moveDown(0.7);
    drawHr(doc);
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(11).text('Totaux de la journée');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10);
    kv(doc, 'Nombre de tickets', String(data.totals.total_sales));
    kv(doc, 'Total HT', formatEUR(data.totals.total_ht));
    kv(doc, 'TVA collectée', formatEUR(data.totals.total_tva));
    if (data.totals.discounts_total > 0) kv(doc, 'Remises accordées', `-${formatEUR(data.totals.discounts_total)}`);
    doc.font('Helvetica-Bold');
    kv(doc, 'TOTAL TTC', formatEUR(data.totals.total_ttc));
    doc.font('Helvetica');

    // TVA
    if (data.tva_breakdown.length > 0) {
      doc.moveDown(0.7);
      drawHr(doc);
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').fontSize(11).text('Récapitulatif TVA par taux');
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(10);
      for (const t of data.tva_breakdown) {
        kv(doc, `TVA ${t.rate}% — base ${formatEUR(t.base_ht)}`, formatEUR(t.tva));
      }
    }

    // Paiements
    doc.moveDown(0.7);
    drawHr(doc);
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(11).text('Modes de règlement');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10);
    for (const p of data.payments_breakdown) {
      const label = PAYMENT_LABELS[p.method] ?? p.method;
      if (p.declared !== undefined && Math.abs((p.counted ?? 0) - (p.declared ?? 0)) > 0.005) {
        kv(doc, label, `${formatEUR(p.counted)} (déclaré ${formatEUR(p.declared)} · écart ${formatEUR((p.declared ?? 0) - p.counted)})`);
      } else {
        kv(doc, label, formatEUR(p.counted));
      }
    }

    // Espèces
    doc.moveDown(0.7);
    drawHr(doc);
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(11).text('Contrôle des espèces');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10);
    kv(doc, 'Espèces attendues (système)', formatEUR(data.cash.expected));
    kv(doc, 'Espèces comptées', formatEUR(data.cash.counted));
    const variance = data.cash.variance;
    const varianceLabel = variance === 0 ? 'Écart' : (variance > 0 ? 'Surplus en caisse' : 'Manquant en caisse');
    kv(doc, varianceLabel, `${variance >= 0 ? '+' : ''}${formatEUR(variance)}`);

    if (data.cash.denomination_count) {
      doc.moveDown(0.5);
      doc.font('Helvetica-Oblique').fontSize(9).text('Détail du comptage :');
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(9);
      const entries = Object.entries(data.cash.denomination_count)
        .filter(([, q]) => q > 0)
        .sort((a, b) => Number(b[0]) - Number(a[0]));
      for (const [denom, qty] of entries) {
        const total = Number(denom) * qty;
        const label = DENOMINATION_LABELS[denom] ?? `${denom} €`;
        kv(doc, `${label} × ${qty}`, formatEUR(total), { faded: true });
      }
    }

    // Empreinte fiscale
    doc.moveDown(1);
    drawHr(doc);
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(10).text('Empreinte fiscale (hash de scellement)');
    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#444')
       .text(data.fiscal_hash, { align: 'left' });
    doc.fillColor('#000');
    doc.moveDown(0.4);
    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#666').text(
      'Ce rapport est généré à partir d\'un événement fiscal append-only scellé en base de données. ' +
      'Toute modification a posteriori est interdite par les déclencheurs Postgres et serait détectée par la vérification de la chaîne (art. 286, I, 3°bis du CGI).',
      { align: 'justify' },
    );
    doc.fillColor('#000');

    doc.end();
  });
}

function kv(doc: PDFKit.PDFDocument, label: string, value: string, opts?: { faded?: boolean }) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const y = doc.y;
  const color = opts?.faded ? '#666' : '#000';
  doc.fillColor(color);
  doc.text(label, left, y, { width: width * 0.7, continued: false });
  const labelHeight = doc.y - y;
  doc.text(value, left, y, { width, align: 'right' });
  doc.y = y + labelHeight;
  doc.fillColor('#000');
}

function drawHr(doc: PDFKit.PDFDocument) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#DDD').lineWidth(0.5).stroke().strokeColor('#000');
}
