import PDFDocument from 'pdfkit';
import { formatEUR } from './money';

/**
 * Carte cadeau HelloPos — PDF A4 destiné à être joint à l'email de
 * distribution (voir lib/services/online-gift-card-delivery.ts) et à être
 * imprimé/conservé. Devient la représentation DE RÉFÉRENCE de la carte
 * (l'email d'accompagnement reste volontairement léger, voir
 * lib/email/gift-card-template.ts).
 *
 * Mise en page inspirée de la carte cadeau PHYSIQUE existante (bandeau de
 * couleur à gauche avec le nom de la boutique, champs « Pour / De la part
 * de / Montant / Expire le / Message » à droite) — mais déjà REMPLIE,
 * puisque ce PDF est un document généré et non une carte à compléter à la
 * main.
 *
 * Multi-tenant : aucune enseigne codée en dur — `organizationName` (et,
 * s'ils sont fournis, `storeNames`) sont des DONNÉES, jamais des
 * constantes. Pas de logo/couleurs par organisation à ce stade : palette
 * HelloPos neutre et élégante, cohérente avec l'accent déjà utilisé dans
 * l'email (#2F6F4F).
 *
 * Toutes les valeurs dynamiques (nom d'organisation/boutique, bénéficiaire,
 * acheteur, message) passent par `doc.text(...)` de PDFKit, qui les rend
 * comme du texte littéral dans le flux du contenu — jamais interprétées
 * comme du balisage ou des opérateurs PDF : aucune injection possible
 * depuis ces champs, contrairement à l'email (HTML), qui doit lui passer
 * par `escapeHtml`.
 *
 * N'expose jamais organization_id, l'id de session Stripe, le
 * payment_intent, la clé publique d'intégration ni aucune donnée technique.
 */

export interface GiftCardCertificateData {
  organizationName: string;
  amountCents: number;
  /** Titulaire de la carte : toujours recipient.name, jamais buyer.name. */
  holderName: string;
  /** Acheteur (« De la part de ») — absent sur une carte plus ancienne, le
   *  champ est alors simplement omis plutôt que laissé vide. */
  buyerName?: string | null;
  code: string;
  message?: string | null;
  issuedAt: string;
  /** Uniquement si une expiration existe réellement (voir GiftCardService.create). */
  expiresAt?: string | null;
  /**
   * Boutiques actives de l'organisation où la carte est utilisable —
   * calculées dynamiquement par l'appelant (jamais codées en dur ici),
   * dédupliquées par nom. `undefined`/vide : repli sur la phrase historique
   * (nom d'organisation seul), pour les organisations mono-boutique ou si
   * la liste n'a pas pu être résolue.
   */
  storeNames?: string[];
}

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

/** Largeur/hauteur intrinsèques d'un PNG, lues directement dans son en-tête
 *  IHDR (toujours aux mêmes octets dans un PNG valide) — jamais une
 *  proportion supposée : la hauteur RÉELLEMENT dessinée du code-barres
 *  (une fois mis à l'échelle à la largeur voulue) en dépend directement,
 *  et une hauteur de cadre devinée à l'avance avait laissé le code-barres
 *  déborder du cadre qui est censé le contenir. */
function pngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** « A, B et C » (jamais de virgule d'Oxford ici — convention française). */
function joinList(items: string[]): string {
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

/** Phrase d'usage : liste les boutiques si connues (dynamique), sinon
 *  repli sur le nom d'organisation seul — jamais une boutique codée en dur. */
function buildUsageSentence(organizationName: string, storeNames?: string[]): string {
  const names = (storeNames ?? []).filter((n) => n.trim());
  if (names.length === 0) {
    return `Cette carte cadeau est utilisable dans les boutiques ${organizationName}. `
      + `Présentez ce code en caisse (imprimé ou depuis votre téléphone).`;
  }
  if (names.length === 1) {
    return `Cette carte cadeau est utilisable en boutique ${names[0]}. `
      + `Présentez ce code en caisse (imprimé ou depuis votre téléphone).`;
  }
  return `Cette carte cadeau est utilisable dans nos boutiques ${joinList(names)}. `
    + `Présentez ce code en caisse (imprimé ou depuis votre téléphone).`;
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

/** Une ligne « étiquette au-dessus / valeur en dessous » du panneau droit de
 *  la carte — label fixe (toujours court), valeur dynamique (peut être
 *  longue : nom, message jusqu'à 500 caractères — voir le contrat du
 *  widget). Mesurée puis dessinée par la même fonction pour ne jamais
 *  diverger entre la hauteur réservée et le texte réellement posé. */
interface FieldRow { label: string; value: string; valueFont: string; valueSize: number; valueColor: string; italic?: boolean }

function measureRow(doc: PDFKit.PDFDocument, row: FieldRow, width: number): number {
  doc.font('Helvetica').fontSize(8.5);
  const labelH = doc.heightOfString(row.label.toUpperCase(), { width, characterSpacing: 0.3 });
  doc.font(row.valueFont).fontSize(row.valueSize);
  const valueH = doc.heightOfString(row.value, { width });
  return labelH + 2 + valueH;
}

function drawRow(doc: PDFKit.PDFDocument, row: FieldRow, x: number, y: number, width: number): number {
  doc.font('Helvetica').fontSize(8.5).fillColor(INK_SOFT)
    .text(row.label.toUpperCase(), x, y, { width, characterSpacing: 0.3 });
  const afterLabelY = doc.y + 2;
  doc.font(row.valueFont).fontSize(row.valueSize).fillColor(row.valueColor)
    .text(row.value, x, afterLabelY, { width });
  return doc.y;
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

    // ------------------------------------------------------------------
    // Carte (en-tête visuel, façon carte physique) : panneau de couleur à
    // gauche (nom de la boutique) + panneau blanc à droite (titre + champs
    // déjà remplis). La hauteur de la carte est dérivée du contenu réel du
    // panneau droit (mesuré AVANT tout dessin) — jamais une hauteur fixe
    // devinée à l'avance, qui couperait un message long ou un nom qui
    // s'enroule sur plusieurs lignes (voir le correctif équivalent sur le
    // cadre RIB de la facture, lib/services/invoice-pdf.ts).
    // ------------------------------------------------------------------
    const cardTop = MARGIN;
    const panelW = contentW * 0.34;
    const rx = MARGIN + panelW + 28;
    const rw = contentW - panelW - 28 - 24;
    const topPad = 26;
    const bottomPad = 26;
    const rowGap = 14;

    const rows: FieldRow[] = [];
    rows.push({ label: 'Pour', value: data.holderName, valueFont: 'Helvetica-Bold', valueSize: 13, valueColor: INK });
    const buyerName = (data.buyerName ?? '').trim();
    if (buyerName) rows.push({ label: 'De la part de', value: buyerName, valueFont: 'Helvetica-Bold', valueSize: 13, valueColor: INK });

    const amountLabel = 'Montant';
    const amountValue = formatEUR(data.amountCents / 100);
    const expiresLabel = 'Expire le';
    const expiresValue = data.expiresAt ? fmtDateFr(data.expiresAt) : null;

    const message = (data.message ?? '').trim();

    // Titre
    doc.font('Times-Bold').fontSize(24);
    const titleH = doc.heightOfString('Carte cadeau', { width: rw });

    // Lignes Pour / De la part de
    let rowsH = 0;
    for (const row of rows) rowsH += measureRow(doc, row, rw) + rowGap;

    // Ligne Montant / Expire le (toujours courte : montant et date formatés)
    const amountRowH = measureRow(doc, { label: amountLabel, value: amountValue, valueFont: 'Helvetica-Bold', valueSize: 14, valueColor: ACCENT_DEEP }, rw / 2 - 10) + rowGap;

    // Message (peut être long — jusqu'à 500 caractères, voir le widget)
    let messageH = 0;
    if (message) {
      doc.font('Helvetica-Oblique').fontSize(10.5);
      messageH = measureRow(doc, { label: 'Message', value: `« ${message} »`, valueFont: 'Helvetica-Oblique', valueSize: 10.5, valueColor: INK }, rw) + rowGap;
    }

    const cardH = Math.max(
      topPad + titleH + 10 + rowsH + amountRowH + messageH + bottomPad,
      150, // hauteur minimale : garde un panneau gauche lisible même pour une carte sans message
    );

    // --- Dessin : panneau gauche (couleur), bordure, puis texte ---
    doc.save();
    doc.roundedRect(MARGIN, cardTop, contentW, cardH, 14).clip();
    doc.rect(MARGIN, cardTop, panelW, cardH).fill(ACCENT_DEEP);
    doc.restore();
    doc.roundedRect(MARGIN, cardTop, contentW, cardH, 14).lineWidth(1).stroke(BORDER);

    // Nom de la boutique/organisation (DYNAMIQUE — jamais codé en dur),
    // réduit jusqu'à tenir sur UNE SEULE ligne quel que soit le nom, court
    // ("Plante Verte") ou plus long — jamais tronqué ni retourné à la ligne.
    const nameMaxW = panelW - 48;
    let nameSize = 22;
    doc.font('Times-Bold');
    while (nameSize > 12 && doc.fontSize(nameSize).widthOfString(data.organizationName) > nameMaxW) {
      nameSize -= 1;
    }
    doc.fillColor('#FFFFFF').fontSize(nameSize)
      .text(data.organizationName, MARGIN + 24, cardTop + cardH / 2 - nameSize / 2, { width: nameMaxW, lineBreak: false });

    // Panneau droit : titre puis champs.
    let ry = cardTop + topPad;
    doc.font('Times-Bold').fontSize(24).fillColor(INK).text('Carte cadeau', rx, ry, { width: rw });
    ry += titleH + 10;

    for (const row of rows) { ry = drawRow(doc, row, rx, ry, rw) + rowGap; }

    doc.font('Helvetica').fontSize(8.5).fillColor(INK_SOFT)
      .text(amountLabel.toUpperCase(), rx, ry, { width: rw / 2 - 10, characterSpacing: 0.3 });
    if (expiresValue) {
      doc.text(expiresLabel.toUpperCase(), rx + rw / 2, ry, { width: rw / 2, characterSpacing: 0.3 });
    }
    const amountValueY = doc.y + 2;
    doc.font('Helvetica-Bold').fontSize(14).fillColor(ACCENT_DEEP)
      .text(amountValue, rx, amountValueY, { width: rw / 2 - 10 });
    if (expiresValue) {
      doc.font('Helvetica-Bold').fontSize(12).fillColor(INK)
        .text(expiresValue, rx + rw / 2, amountValueY, { width: rw / 2 });
    }
    ry = Math.max(doc.y, amountValueY) + rowGap;

    if (message) {
      drawRow(
        doc,
        { label: 'Message', value: `« ${message} »`, valueFont: 'Helvetica-Oblique', valueSize: 10.5, valueColor: INK },
        rx, ry, rw,
      );
    }

    // ------------------------------------------------------------------
    // Code + usage (inchangé dans l'esprit de l'ancienne mise en page,
    // repositionné sous la carte).
    // ------------------------------------------------------------------
    let y = cardTop + cardH + 32;
    doc.fillColor(INK);

    // Zone "CODE DE LA CARTE" + code (toujours présente) ≈ 66pt, puis le
    // code-barres s'il a pu être généré, mis à l'échelle à `barcodeW` — sa
    // hauteur RÉELLEMENT dessinée en découle (jamais une hauteur de cadre
    // devinée à l'avance, voir pngDimensions).
    const barcodeTextZoneH = 66;
    const barcodeW = Math.min(contentW - 80, 260);
    const barcodeDim = barcodePng ? pngDimensions(barcodePng) : null;
    const barcodeDrawnH = barcodeDim ? barcodeW * (barcodeDim.height / barcodeDim.width) : 0;
    const codeBoxH = barcodePng ? barcodeTextZoneH + barcodeDrawnH + 14 : 76;
    doc.save();
    doc.roundedRect(MARGIN, y, contentW, codeBoxH, 12).lineWidth(1).stroke(BORDER);
    doc.restore();

    doc.font('Helvetica').fontSize(10).fillColor(INK_SOFT)
      .text('CODE DE LA CARTE', MARGIN, y + 16, { width: contentW, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(22).fillColor(ACCENT_DEEP)
      .text(formatCodeReadable(data.code), MARGIN, y + 32, { width: contentW, align: 'center', characterSpacing: 1 });

    if (barcodePng) {
      const barcodeX = MARGIN + (contentW - barcodeW) / 2;
      doc.image(barcodePng, barcodeX, y + barcodeTextZoneH, { width: barcodeW });
    }

    y += codeBoxH + 28;

    doc.font('Helvetica').fontSize(10).fillColor(INK_SOFT)
      .text(`Émise le ${fmtDateFr(data.issuedAt)}`, MARGIN, y, { width: contentW });
    y = doc.y + 20;

    doc.font('Helvetica').fontSize(10).fillColor(INK_SOFT)
      .text(buildUsageSentence(data.organizationName, data.storeNames), MARGIN, y, { width: contentW });

    // Pied de page discret, position ABSOLUE (pas de doc.y en cascade) pour
    // ne jamais chevaucher un bloc précédent même si le message est long.
    doc.font('Helvetica').fontSize(8).fillColor(INK_SOFT)
      .text('Cette carte n’est ni rechargeable ni remboursable en espèces.',
        MARGIN, PAGE_H - MARGIN - 14, { width: contentW, align: 'center' });

    doc.end();
  });
}
