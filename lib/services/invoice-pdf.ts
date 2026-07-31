import PDFDocument from 'pdfkit';
import { formatEUR } from './money';
import type { InvoiceSaleGroup } from './invoice-lines';

/** Formate une date (string 'YYYY-MM-DD', ISO ou Date) en jj/mm/aaaa. '—' si vide. */
function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  const s = String(d);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('fr-FR');
}

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
  notes?: string | null;
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
  /**
   * Lignes regroupées par vente d'origine. Quand il y a plus d'un groupe
   * (facture de période), chaque vente est affichée sur un fond gris clair
   * alterné avec l'en-tête de son ticket. Le commentaire éventuel de chaque
   * vente est imprimé au sein de ses lignes. Optionnel : à défaut on retombe
   * sur `lines` (un seul groupe).
   */
  groups?: InvoiceSaleGroup[];
  /** Mode de règlement (libellé) — ex. « Espèces + Carte bancaire », « En compte ». */
  payment_method?: string | null;
  /** Date de règlement (facture acquittée), YYYY-MM-DD/ISO. */
  paid_at?: string | null;
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
  // Émetteur uniquement : mentions légales de pied de facture.
  capital_social?: string | null;
  ape_code?: string | null;
  // Émetteur uniquement : coordonnées bancaires (RIB) à afficher.
  bank?: {
    show: boolean;
    holder?: string;
    name?: string;
    iban?: string;
    bic?: string;
  } | null;
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
    if (customer.email) doc.text(customer.email, 340, doc.y);
    if (customer.address?.line1) doc.text(customer.address.line1, 340, doc.y);
    if (customer.address?.zip || customer.address?.city) doc.text(`${customer.address?.zip ?? ''} ${customer.address?.city ?? ''}`.trim(), 340, doc.y);
    if (customer.siret) doc.text(`SIRET ${customer.siret}`, 340, doc.y);
    if (customer.vat_number) doc.text(`TVA intra. ${customer.vat_number}`, 340, doc.y);

    // Méta facture (dates) — largeurs fixées pour éviter tout chevauchement.
    const metaY = 220;
    doc.font('Helvetica').fontSize(9).fillColor('#666');
    doc.text('Date d\'émission', 48, metaY, { width: 140 });
    doc.text('Date de prestation', 200, metaY, { width: 140 });
    if (invoice.due_date) doc.text('Échéance', 350, metaY, { width: 140 });
    doc.fillColor('#000').font('Helvetica-Bold');
    doc.text(fmtDate(invoice.issue_date), 48, metaY + 12, { width: 140 });
    doc.text(fmtDate(invoice.service_date), 200, metaY + 12, { width: 140 });
    if (invoice.due_date) doc.text(fmtDate(invoice.due_date), 350, metaY + 12, { width: 140 });

    // 2ᵉ ligne méta : mode de règlement + date de règlement (si acquittée).
    const meta2Y = metaY + 30;
    const paid = invoice.status === 'paid';
    if (invoice.payment_method || (paid && invoice.paid_at)) {
      doc.font('Helvetica').fontSize(9).fillColor('#666');
      if (invoice.payment_method) doc.text('Mode de règlement', 48, meta2Y, { width: 140 });
      if (paid && invoice.paid_at) doc.text('Date de règlement', 200, meta2Y, { width: 140 });
      doc.fillColor('#000').font('Helvetica-Bold');
      if (invoice.payment_method) doc.text(invoice.payment_method, 48, meta2Y + 12, { width: 140 });
      if (paid && invoice.paid_at) doc.text(fmtDate(invoice.paid_at), 200, meta2Y + 12, { width: 140 });
    }

    // Table des lignes (décalée pour laisser la place à la 2ᵉ ligne méta).
    const tableTop = 300;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#666');
    doc.text('DÉSIGNATION', 48, tableTop);
    doc.text('QTÉ', 340, tableTop, { width: 30, align: 'right' });
    doc.text('PU HT', 375, tableTop, { width: 50, align: 'right' });
    doc.text('TVA', 430, tableTop, { width: 25, align: 'right' });
    doc.text('TOTAL HT', 460, tableTop, { width: 80, align: 'right' });

    drawHr(doc, tableTop + 14);

    // Groupes = lignes par vente d'origine. À défaut (ancienne facture), un
    // seul groupe reprenant `invoice.lines` et le commentaire de la facture.
    const groups: InvoiceSaleGroup[] =
      invoice.groups && invoice.groups.length > 0
        ? invoice.groups
        : [{ saleId: null, receipt: null, notes: invoice.notes ?? null, lines: invoice.lines }];
    // Fond gris alterné + en-têtes de ticket seulement s'il y a plusieurs
    // ventes (facture de période).
    const grouped = groups.length > 1;

    doc.fillColor('#000').font('Helvetica').fontSize(9);
    let y = tableTop + 22;
    let gi = 0;
    for (const g of groups) {
      // Mesure la hauteur du groupe (en-tête + lignes + commentaire) pour
      // tracer le fond d'un seul tenant et gérer un saut de page propre.
      const headerH = grouped && g.receipt ? 15 : 0;
      doc.font('Helvetica').fontSize(9);
      const lineHeights = g.lines.map(
        (l) => Math.max(doc.heightOfString(l.label, { width: 280 }), 12) + 4,
      );
      const bodyH = lineHeights.reduce((a, b) => a + b, 0);
      let commentH = 0;
      if (g.notes) {
        doc.font('Helvetica-Oblique').fontSize(8.5);
        commentH = doc.heightOfString(`Commentaire : ${g.notes}`, { width: 470 }) + 4;
      }
      const groupH = headerH + bodyH + commentH + (grouped ? 6 : 0);

      // Saut de page si le groupe ne tient pas (sauf s'il est déjà en tête).
      if (y + groupH > 720 && y > tableTop + 22) {
        doc.addPage();
        y = 50;
      }

      // Fond gris clair alterné (2ᵉ, 4ᵉ… vente) pour distinguer chaque vente.
      if (grouped && gi % 2 === 1) {
        doc.rect(44, y - 3, 508, groupH).fill('#F4F4F5');
        doc.fillColor('#000');
      }

      // En-tête de groupe : numéro de ticket de la vente.
      if (grouped && g.receipt) {
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#555')
          .text(`Ticket ${g.receipt}`, 48, y, { width: 490 });
        doc.fillColor('#000');
        y += headerH;
      }

      // Lignes de la vente.
      for (let i = 0; i < g.lines.length; i++) {
        const l = g.lines[i]!;
        const startY = y;
        doc.font('Helvetica').fontSize(9).fillColor('#000');
        doc.text(l.label, 48, startY, { width: 280 });
        doc.text(String(l.quantity), 340, startY, { width: 30, align: 'right' });
        doc.text(formatEUR(l.unit_price_ht), 375, startY, { width: 50, align: 'right' });
        doc.text(`${l.tax_rate}%`, 430, startY, { width: 25, align: 'right' });
        doc.text(formatEUR(l.line_ht), 460, startY, { width: 80, align: 'right' });
        y = startY + lineHeights[i]!;
      }

      // Commentaire de la vente, imprimé au sein de ses lignes.
      if (g.notes) {
        doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#444')
          .text(`Commentaire : ${g.notes}`, 56, y, { width: 470 });
        doc.fillColor('#000').font('Helvetica');
        y += commentH;
      }

      if (grouped) y += 6;
      gi++;
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

    // (Le commentaire de chaque vente est désormais imprimé au sein de ses
    // lignes, plus haut dans le tableau.)

    // Conditions
    if (invoice.payment_terms) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#666').text('CONDITIONS DE RÈGLEMENT', 48, y);
      doc.fillColor('#000').font('Helvetica').fontSize(9).text(invoice.payment_terms, 48, y + 12, { width: 480 });
      y = doc.y + 10;
    }

    if (paid) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#2F6B3F')
         .text(
           invoice.paid_at ? `FACTURE ACQUITTÉE le ${fmtDate(invoice.paid_at)}` : 'FACTURE ACQUITTÉE',
           48, y,
         );
      doc.fillColor('#000');
      y += 16;
    }

    // Coordonnées bancaires (RIB) — si activé pour la boutique.
    const bank = emitter.bank;
    if (bank?.show && (bank.iban || bank.holder || bank.name)) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#666').text('COORDONNÉES BANCAIRES', 48, y);
      doc.fillColor('#000').font('Helvetica').fontSize(9);
      y += 12;
      const parts: string[] = [];
      if (bank.holder) parts.push(`Titulaire : ${bank.holder}`);
      if (bank.name) parts.push(`Banque : ${bank.name}`);
      for (const p of parts) { doc.text(p, 48, y, { width: 480 }); y = doc.y; }
      if (bank.iban) { doc.font('Helvetica-Bold').text(`IBAN : ${bank.iban}`, 48, y, { width: 480 }); y = doc.y; doc.font('Helvetica'); }
      if (bank.bic) { doc.text(`BIC : ${bank.bic}`, 48, y, { width: 480 }); y = doc.y; }
      y += 10;
    }

    // Mentions légales
    if (invoice.legal_mentions) {
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#666')
         .text(invoice.legal_mentions, 48, y, { width: 480, align: 'justify' });
      doc.fillColor('#000');
    }

    // Pied : identité légale de l'entreprise (mentions obligatoires).
    const legalBits: string[] = [];
    const legalName = emitter.legal_name || emitter.name;
    if (legalName) legalBits.push(legalName);
    if (emitter.capital_social) legalBits.push(`Capital social ${emitter.capital_social}`);
    if (emitter.siret) legalBits.push(`SIRET ${emitter.siret}`);
    if (emitter.ape_code) legalBits.push(`APE ${emitter.ape_code}`);
    if (emitter.vat_number) legalBits.push(`TVA intra. ${emitter.vat_number}`);
    if (legalBits.length > 0) {
      doc.font('Helvetica').fontSize(7.5).fillColor('#888').text(
        legalBits.join(' · '),
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
