import PDFDocument from 'pdfkit';
import { formatEUR } from './money';

/**
 * Carte cadeau HelloPos — PDF A4 destiné à être joint à l'email de
 * distribution (voir lib/services/online-gift-card-delivery.ts) et à être
 * imprimé/conservé. Devient la représentation DE RÉFÉRENCE de la carte
 * (l'email d'accompagnement reste volontairement léger, voir
 * lib/email/gift-card-template.ts).
 *
 * Multi-tenant : aucune enseigne codée en dur — seul `organizationName`
 * (donnée) figure sur la carte. Pas de branding par organisation à ce
 * stade (logo/couleurs) : palette HelloPos neutre et élégante, cohérente
 * avec l'accent déjà utilisé dans l'email (#2F6F4F).
 *
 * Toutes les valeurs dynamiques (nom d'organisation, bénéficiaire, message)
 * passent par `doc.text(...)` de PDFKit, qui les rend comme du texte
 * littéral dans le flux du contenu — jamais interprétées comme du balisage
 * ou des opérateurs PDF : aucune injection possible depuis ces champs,
 * contrairement à l'email (HTML), qui doit lui passer par `escapeHtml`.
 *
 * N'expose jamais organization_id, l'id de session Stripe, le
 * payment_intent, la clé publique d'intégration ni aucune donnée technique.
 */

export interface GiftCardCertificateData {
  organizationName: string;
  amountCents: number;
  /** Titulaire de la carte : toujours recipient.name, jamais buyer.name. */
  holderName: string;
  code: string;
  message?: string | null;
  issuedAt: string;
  /** Uniquement si une expiration existe réellement (voir GiftCardService.create). */
  expiresAt?: string | null;
}

const ACCENT = '#2F6F4F'; // même accent que lib/email/gift-card-template.ts
const ACCENT_DEEP = '#1F4E37';
const INK = '#14211D';
const INK_SOFT = '#5A625E';
const BORDER = '#E7E3D8';
const PAGE_W = 595.28; // A4 en points (72dpi)
const PAGE_H = 841.89;
const MARGIN = 48;

function fmtDateFr(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR');
}

/** Groupe le code par paquets de 4 caractères pour la lisibilité (même
 *  convention que l'écran de gestion des cartes cadeaux). */
function formatCodeReadable(code: string): string {
  return code.replace(/(.{4})(?=.)/g, '$1 ').trim();
}

type BwipNode = { toBuffer: (opts: Record<string, unknown>) => Promise<Buffer> };

/**
 * Rend le code en EAN-13 (PNG) — même approche que
 * lib/services/gift-card-pdf.ts (ticket boutique 80mm), dupliquée ici à
 * l'identique plutôt que factorisée : `lib/services/barcode.ts` existe déjà
 * dans ce projet pour un tout autre usage (SVG pour les étiquettes,
 * `barcodeSvg`/`ean13Svg`/`code128Svg`), donc pas de renommage risqué de ce
 * module existant pour ce petit bloc. N'échoue jamais : un agrément visuel
 * manquant n'est jamais bloquant, le code reste toujours lisible en texte.
 */
async function renderEan13Png(code: string): Promise<Buffer | null> {
  try {
    const mod = (await import('bwip-js/node')) as unknown as {
      default?: BwipNode; toBuffer?: BwipNode['toBuffer'];
    };
    const bwip = mod.toBuffer ? { toBuffer: mod.toBuffer } : mod.default?.toBuffer ? { toBuffer: mod.default.toBuffer } : null;
    if (!bwip) return null;
    return await bwip.toBuffer({
      bcid: 'ean13', text: code, scale: 3, height: 14, includetext: true,
      textxalign: 'center', textsize: 11, backgroundcolor: 'FFFFFF', paddingwidth: 4, paddingheight: 4,
    });
  } catch {
    return null;
  }
}

export async function renderGiftCardCertificatePdf(data: GiftCardCertificateData): Promise<Buffer> {
  const barcodePng = await renderEan13Png(data.code);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
    const chunks: Buffer[] = [];
    doc.on('data', (b: Buffer) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const contentW = PAGE_W - MARGIN * 2;

    // --- Bandeau supérieur : organisation + titre + montant (mis en avant) ---
    const bannerH = 190;
    doc.save();
    doc.roundedRect(MARGIN, MARGIN, contentW, bannerH, 16).fill(ACCENT);
    doc.restore();

    doc.fillColor('#FFFFFF');
    doc.font('Helvetica-Bold').fontSize(11)
      .text(data.organizationName.toUpperCase(), MARGIN + 32, MARGIN + 28, { width: contentW - 64 });
    doc.font('Helvetica').fontSize(20).fillColor('#FFFFFF')
      .text('Carte cadeau', MARGIN + 32, MARGIN + 50, { width: contentW - 64 });
    doc.font('Helvetica-Bold').fontSize(52).fillColor('#FFFFFF')
      .text(formatEUR(data.amountCents / 100), MARGIN + 32, MARGIN + 100, { width: contentW - 64 });

    // --- Corps : bénéficiaire, message, code, dates, usage ---
    let y = MARGIN + bannerH + 36;
    doc.fillColor(INK);

    doc.font('Helvetica').fontSize(11).fillColor(INK_SOFT)
      .text('CARTE ÉTABLIE AU NOM DE', MARGIN, y, { width: contentW });
    y += 16;
    doc.font('Helvetica-Bold').fontSize(20).fillColor(INK)
      .text(data.holderName, MARGIN, y, { width: contentW });
    y = doc.y + 16;

    const message = (data.message ?? '').trim();
    if (message) {
      doc.font('Helvetica-Oblique').fontSize(12).fillColor(INK)
        .text(`« ${message} »`, MARGIN, y, { width: contentW });
      y = doc.y + 20;
    }

    // Bloc code : encadré, centré, toujours lisible en clair (même si un
    // code-barre est également présent — jamais l'un à la place de l'autre).
    const codeBoxH = barcodePng ? 132 : 76;
    doc.save();
    doc.roundedRect(MARGIN, y, contentW, codeBoxH, 12).lineWidth(1).stroke(BORDER);
    doc.restore();

    doc.font('Helvetica').fontSize(10).fillColor(INK_SOFT)
      .text('CODE DE LA CARTE', MARGIN, y + 16, { width: contentW, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(22).fillColor(ACCENT_DEEP)
      .text(formatCodeReadable(data.code), MARGIN, y + 32, { width: contentW, align: 'center', characterSpacing: 1 });

    if (barcodePng) {
      const barcodeW = Math.min(contentW - 80, 260);
      const barcodeX = MARGIN + (contentW - barcodeW) / 2;
      doc.image(barcodePng, barcodeX, y + 66, { width: barcodeW });
    }

    y += codeBoxH + 28;

    doc.font('Helvetica').fontSize(10).fillColor(INK_SOFT);
    doc.text(`Émise le ${fmtDateFr(data.issuedAt)}`, MARGIN, y, { width: contentW });
    if (data.expiresAt) {
      doc.text(`Valable jusqu'au ${fmtDateFr(data.expiresAt)}`, MARGIN, doc.y + 2, { width: contentW });
    }
    y = doc.y + 24;

    doc.font('Helvetica').fontSize(10).fillColor(INK_SOFT)
      .text(
        `Cette carte cadeau est utilisable dans les boutiques ${data.organizationName}. `
        + `Présentez ce code en caisse (imprimé ou depuis votre téléphone).`,
        MARGIN, y, { width: contentW },
      );

    // Pied de page discret, position ABSOLUE (pas de doc.y en cascade) pour
    // ne jamais chevaucher un bloc précédent même si le message est long.
    doc.font('Helvetica').fontSize(8).fillColor(INK_SOFT)
      .text('Cette carte n’est ni rechargeable ni remboursable en espèces.',
        MARGIN, PAGE_H - MARGIN - 14, { width: contentW, align: 'center' });

    doc.end();
  });
}
