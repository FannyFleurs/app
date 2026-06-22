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

/**
 * Charge bwip-js en différé. Si la lib n'est pas installée localement,
 * on renvoie null et le PDF fonctionne sans visuel de code-barre.
 */
async function loadBwip(): Promise<null | {
  toBuffer: (
    opts: Record<string, unknown>,
    cb: (err: Error | null, png: Buffer) => void,
  ) => void;
}> {
  try {
    // Indirection volontaire : empêche webpack de tracer le module au build.
    // Si bwip-js n'est pas installé, on tombe juste dans le catch et le PDF
    // est rendu sans visuel de code-barre.
    const nodeRequire = eval('require') as NodeJS.Require;
    const mod = nodeRequire('bwip-js');
    return mod?.default ?? mod;
  } catch {
    return null;
  }
}

export async function renderGiftCardPdf(data: GiftCardPdfData, org: OrgInfo): Promise<Buffer> {
  // Génère le code-barre EAN-13 en PNG si la lib est dispo
  const bwip = await loadBwip();
  let barcodePng: Buffer | null = null;
  if (bwip) {
    try {
      barcodePng = await new Promise<Buffer>((resolve, reject) => {
        bwip.toBuffer({
          bcid: 'ean13',
          text: data.code,
          scale: 3,
          height: 14,
          includetext: true,
          textxalign: 'center',
          textsize: 10,
          backgroundcolor: 'FFFFFF',
        }, (err: Error | null, png: Buffer) => (err ? reject(err) : resolve(png)));
      });
    } catch {
      barcodePng = null;
    }
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (b: Buffer) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;

    // En-tête boutique
    doc.font('Helvetica-Bold').fontSize(11).text(org.name, { align: 'center' });
    if (org.address?.line1) {
      doc.font('Helvetica').fontSize(8)
         .text(`${org.address.line1}${org.address.zip || org.address.city ? ' · ' : ''}${org.address.zip ?? ''} ${org.address.city ?? ''}`.trim(),
               { align: 'center' });
    }
    if (org.phone) doc.text(org.phone, { align: 'center' });

    doc.moveDown(1);

    // Bandeau "CARTE CADEAU"
    const bandY = doc.y;
    doc.rect(36, bandY, W - 72, 50).fillColor('#EFF4EA').fill();
    doc.fillColor('#3F5430').font('Helvetica-Bold').fontSize(22)
       .text('CARTE CADEAU', 36, bandY + 8, { width: W - 72, align: 'center' });
    doc.fontSize(13).text(formatEUR(data.amount), 36, bandY + 30, { width: W - 72, align: 'center' });
    doc.fillColor('#000');
    doc.y = bandY + 60;

    // Coordonnées
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(9);
    if (data.buyer_name) doc.text(`Offerte par : ${data.buyer_name}`, { align: 'center' });

    doc.moveDown(1);

    // Code-barre (image PNG centrée) ou code en gros si lib absente
    if (barcodePng) {
      const barcodeW = 260;
      const barcodeX = (W - barcodeW) / 2;
      doc.image(barcodePng, barcodeX, doc.y, { width: barcodeW });
      doc.y += 80;
      doc.font('Helvetica-Bold').fontSize(14).text(formatCodeReadable(data.code), { align: 'center' });
    } else {
      // Repli sans code-barre : le code en très grand caractère monospace
      doc.font('Helvetica-Bold').fontSize(28).text(formatCodeReadable(data.code), { align: 'center' });
      doc.moveDown(0.5);
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#888')
         .text('(code-barre visuel : installez la dépendance bwip-js pour l\'activer)',
               { align: 'center' });
      doc.fillColor('#000');
    }

    // Validité
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(9).fillColor('#666');
    doc.text(`Émise le ${new Date(data.issued_at).toLocaleDateString('fr-FR')}${
      data.expires_at ? ` · Valable jusqu'au ${new Date(data.expires_at).toLocaleDateString('fr-FR')}` : ''
    }`, { align: 'center' });
    doc.fillColor('#000');

    // Conditions
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(8).fillColor('#888').text(
      `Présentez cette carte en boutique pour l'utiliser. Le solde sera débité automatiquement.` +
      ` Carte non rechargeable, non remboursable en espèces.`,
      { align: 'center', width: W - 72 },
    );
    doc.fillColor('#000');

    doc.end();
  });
}

function formatCodeReadable(code: string): string {
  return code.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}
