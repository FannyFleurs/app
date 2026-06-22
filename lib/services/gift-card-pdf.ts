import PDFDocument from 'pdfkit';
import { formatEUR } from './money';

export interface GiftCardPdfData {
  code: string;
  amount: number;
  buyer_name?: string | null;
  buyer_phone?: string | null;
  buyer_email?: string | null;
  issued_at: string;
  expires_at?: string | null;
}

export interface OrgInfo {
  name: string;
  legal_name?: string;
  siret?: string | null;
  address?: { line1?: string; zip?: string; city?: string } | null;
  phone?: string | null;
}

async function loadBwip(): Promise<null | {
  toBuffer: (
    opts: Record<string, unknown>,
    cb: (err: Error | null, png: Buffer) => void,
  ) => void;
}> {
  try {
    // Indirection : webpack ne trace pas, et si bwip-js n'est pas installé
    // on tombe dans le catch et le PDF se rend sans visuel de code-barre.
    const nodeRequire = eval('require') as NodeJS.Require;
    const mod = nodeRequire('bwip-js');
    return mod?.default ?? mod;
  } catch {
    return null;
  }
}

/**
 * PDF carte cadeau — format ticket imprimante 80mm (≈226pt de large).
 * Page haute (1000pt) puis trimmée par l'imprimante au feed papier.
 */
export async function renderGiftCardPdf(data: GiftCardPdfData, org: OrgInfo): Promise<Buffer> {
  const W = 226;

  // Code-barre (PNG) si bwip-js est disponible
  const bwip = await loadBwip();
  let barcodePng: Buffer | null = null;
  if (bwip) {
    try {
      barcodePng = await new Promise<Buffer>((resolve, reject) => {
        bwip.toBuffer({
          bcid: 'ean13',
          text: data.code,
          scale: 2,
          height: 12,
          includetext: true,
          textxalign: 'center',
          textsize: 10,
          backgroundcolor: 'FFFFFF',
          paddingwidth: 4,
          paddingheight: 4,
        }, (err: Error | null, png: Buffer) => (err ? reject(err) : resolve(png)));
      });
    } catch {
      barcodePng = null;
    }
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [W, 1000],
      margins: { top: 12, bottom: 12, left: 8, right: 8 },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (b: Buffer) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // En-tête boutique
    doc.font('Helvetica-Bold').fontSize(11).text(org.name, { align: 'center' });
    doc.font('Helvetica').fontSize(8);
    if (org.legal_name && org.legal_name !== org.name) doc.text(org.legal_name, { align: 'center' });
    if (org.address?.line1) doc.text(org.address.line1, { align: 'center' });
    if (org.address?.zip || org.address?.city) {
      doc.text(`${org.address.zip ?? ''} ${org.address.city ?? ''}`.trim(), { align: 'center' });
    }
    if (org.siret) doc.text(`SIRET ${org.siret}`, { align: 'center' });
    if (org.phone) doc.text(org.phone, { align: 'center' });

    doc.moveDown(0.7);
    doc.font('Helvetica').fontSize(7).text('-'.repeat(46), { align: 'center' });
    doc.moveDown(0.3);

    // Titre
    doc.font('Helvetica-Bold').fontSize(13).text('CARTE CADEAU', { align: 'center' });
    doc.moveDown(0.2);

    // Montant
    doc.font('Helvetica-Bold').fontSize(22).text(formatEUR(data.amount), { align: 'center' });
    doc.moveDown(0.4);

    // Acheteur
    if (data.buyer_name) {
      doc.font('Helvetica').fontSize(8).text(`Offerte par : ${data.buyer_name}`, { align: 'center' });
    }
    if (data.buyer_phone) {
      doc.font('Helvetica').fontSize(8).text(data.buyer_phone, { align: 'center' });
    }

    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(7).text('-'.repeat(46), { align: 'center' });
    doc.moveDown(0.3);

    // Code-barre OU code en gros (jamais les deux pour ne pas chevaucher).
    // bwip-js insère déjà le numéro lisible sous le code-barre.
    if (barcodePng) {
      const barcodeW = Math.min(W - 24, 200);
      const barcodeX = (W - barcodeW) / 2;
      doc.image(barcodePng, barcodeX, doc.y, { width: barcodeW });
      // Avance le curseur sous l'image
      doc.y += barcodeW * 0.55;
    } else {
      doc.font('Helvetica-Bold').fontSize(16).text(formatCodeReadable(data.code), { align: 'center' });
      doc.moveDown(0.3);
      doc.font('Helvetica-Oblique').fontSize(6).fillColor('#888')
         .text('(installer bwip-js pour le code-barre)', { align: 'center' });
      doc.fillColor('#000');
    }

    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(7).text('-'.repeat(46), { align: 'center' });
    doc.moveDown(0.3);

    // Validité
    doc.font('Helvetica').fontSize(8);
    doc.text(`Émise le ${new Date(data.issued_at).toLocaleDateString('fr-FR')}`, { align: 'center' });
    if (data.expires_at) {
      doc.text(`Valable jusqu'au ${new Date(data.expires_at).toLocaleDateString('fr-FR')}`, { align: 'center' });
    }

    doc.moveDown(0.6);

    // Conditions
    doc.font('Helvetica').fontSize(7).fillColor('#444').text(
      'Présentez cette carte en boutique. Solde débité automatiquement. Carte non rechargeable, non remboursable en espèces.',
      { align: 'center' },
    );
    doc.fillColor('#000');

    doc.moveDown(0.5);

    doc.end();
  });
}

function formatCodeReadable(code: string): string {
  return code.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}
