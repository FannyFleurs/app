import PDFDocument from 'pdfkit';

/**
 * Liste des écarts d'inventaire, en PDF.
 *
 * L'impression passait par `window.print()` sur la page : on obtenait l'écran
 * tel quel — champs de saisie compris, colonnes coupées à la largeur du
 * navigateur, aucune reprise d'en-tête d'une page à l'autre. Pour un document
 * qu'on emporte dans les rayons et qu'on archive, il faut une vraie mise en
 * page paginée, d'où ce rendu serveur.
 */

export interface InventoryPdfHeader {
  label: string;
  store_name: string;
  created_at: string;
  status: string;
}

export interface InventoryPdfLine {
  product_name: string;
  category_name: string | null;
  sku: string | null;
  barcode: string | null;
  expected_qty: string;
  counted_qty: string;
  purchase_price_ht: string | null;
}

const MARGE = 40;
/** Colonnes : largeurs fixes, pour que l'en-tête et les lignes s'alignent. */
const COLS = [
  { titre: 'Produit',   largeur: 190, align: 'left'  as const },
  { titre: 'SKU / code', largeur: 95, align: 'left'  as const },
  { titre: 'Attendu',   largeur: 55,  align: 'right' as const },
  { titre: 'Compté',    largeur: 55,  align: 'right' as const },
  { titre: 'Écart',     largeur: 50,  align: 'right' as const },
  { titre: 'Valeur',    largeur: 70,  align: 'right' as const },
];

/**
 * Coupe un texte à la largeur d'une colonne, avec une ellipse.
 *
 * `lineBreak: false` et l'option `ellipsis` de pdfkit ne suffisent pas : un
 * SKU à tirets se coupait quand même, et sa fin retombait sur la ligne
 * suivante, au milieu du nom de famille du produit. On tranche donc nous-mêmes,
 * en mesurant avec la police réellement employée.
 */
function tronque(doc: PDFKit.PDFDocument, texte: string, largeur: number): string {
  if (doc.widthOfString(texte) <= largeur) return texte;
  let out = texte;
  while (out.length > 1 && doc.widthOfString(out + '…') > largeur) out = out.slice(0, -1);
  return out + '…';
}

const nb = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/\.?0+$/, ''));
// Le séparateur de milliers de `fr-FR` est une espace fine insécable (U+202F),
// absente de l'encodage WinAnsi des polices standard de pdfkit : elle sortait
// comme un « / » dans le document. On la remplace (ainsi que l'insécable
// classique) par une espace ordinaire.
const eur = (v: number) =>
  `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/\s/g, ' ')} €`;

export async function renderInventoryPdf(
  inv: InventoryPdfHeader, lines: InventoryPdfLine[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGE, layout: 'portrait' });
    const chunks: Buffer[] = [];
    doc.on('data', (b: Buffer) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const bas = doc.page.height - MARGE - 24;

    const enTeteColonnes = () => {
      // `y` figé AVANT la boucle : chaque `doc.text` avance le curseur, et les
      // six intitulés se retrouvaient empilés en escalier au lieu de former
      // une ligne.
      const y = doc.y;
      let x = MARGE;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#555');
      for (const c of COLS) {
        doc.text(c.titre.toUpperCase(), x, y,
          { width: c.largeur, align: c.align, lineBreak: false, ellipsis: true });
        x += c.largeur;
      }
      doc.y = y + 12;
      doc.fillColor('#000');
      trait(doc);
      doc.moveDown(0.3);
    };

    // --- En-tête du document
    doc.font('Helvetica-Bold').fontSize(16).text(inv.label);
    doc.font('Helvetica').fontSize(9).fillColor('#555')
      .text(`${inv.store_name} · créé le ${new Date(inv.created_at).toLocaleString('fr-FR')}`);
    doc.text(`${lines.length} ligne(s) avec écart · édité le ${new Date().toLocaleString('fr-FR')}`);
    doc.fillColor('#000').moveDown(0.8);
    enTeteColonnes();

    let totalValeur = 0;

    for (const l of lines) {
      const attendu = Number(l.expected_qty);
      const compte = Number(l.counted_qty);
      const ecart = Number((compte - attendu).toFixed(3));
      const valeur = Number((ecart * Number(l.purchase_price_ht ?? 0)).toFixed(2));
      totalValeur += valeur;

      // Saut de page AVANT d'écrire la ligne : une ligne coupée en deux est
      // illisible, et l'en-tête doit être repris pour rester lisible seule.
      if (doc.y > bas - 30) {
        doc.addPage();
        enTeteColonnes();
      }

      const y = doc.y;
      let x = MARGE;
      const cellule = (texte: string, i: number, gras = false, couleur = '#000') => {
        doc.font(gras ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(couleur);
        doc.text(tronque(doc, texte, COLS[i]!.largeur - 6), x, y,
          { width: COLS[i]!.largeur, align: COLS[i]!.align, lineBreak: false });
        x += COLS[i]!.largeur;
      };

      cellule(l.product_name, 0, true);
      cellule(l.sku ?? l.barcode ?? '—', 1, false, '#555');
      cellule(nb(attendu), 2);
      cellule(nb(compte), 3);
      // L'écart est ce qu'on vient vérifier : signe explicite, couleur franche.
      cellule(`${ecart > 0 ? '+' : ''}${nb(ecart)}`, 4, true, ecart < 0 ? '#B3261E' : '#2E7D32');
      cellule(eur(valeur), 5, false, valeur < 0 ? '#B3261E' : '#000');

      // La famille sous le nom du produit : elle situe l'article dans le
      // magasin, c'est ce qui guide le déplacement dans les rayons.
      doc.font('Helvetica').fontSize(7.5).fillColor('#777');
      doc.text(tronque(doc, l.category_name ?? '—', COLS[0]!.largeur - 6), MARGE, y + 11,
        { width: COLS[0]!.largeur, lineBreak: false });
      doc.fillColor('#000');
      doc.y = y + 22;
    }

    if (lines.length === 0) {
      doc.font('Helvetica').fontSize(10).fillColor('#555')
        .text('Aucun écart : le comptage correspond au stock attendu.', MARGE, doc.y + 10);
      doc.fillColor('#000');
    } else {
      doc.moveDown(0.4);
      trait(doc);
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(10)
        .text(`Valeur totale des écarts : ${eur(Number(totalValeur.toFixed(2)))}`,
          MARGE, doc.y, { width: doc.page.width - 2 * MARGE, align: 'right' });
    }

    doc.end();
  });
}

function trait(doc: PDFKit.PDFDocument) {
  doc.moveTo(MARGE, doc.y).lineTo(doc.page.width - MARGE, doc.y)
    .lineWidth(0.5).strokeColor('#CCC').stroke().strokeColor('#000');
}

/**
 * Rapport d'inventaire complet, en PDF.
 *
 * La liste des écarts (`renderInventoryPdf`) sert à corriger dans les rayons ;
 * ce rapport-ci sert à archiver et à justifier. Il reprend TOUTES les lignes
 * comptées, regroupées par famille, valorise le stock final au prix d'achat HT
 * (compté × PA), et récapitule les écarts (+/−) et la régularisation nette. On
 * en tire le montant de stock par catégorie et le total, tels que demandés pour
 * le dossier d'inventaire.
 */
const COLS_RAPPORT = [
  { titre: 'Produit',      largeur: 200, align: 'left'  as const },
  { titre: 'Attendu',      largeur: 70,  align: 'right' as const },
  { titre: 'Compté',       largeur: 70,  align: 'right' as const },
  { titre: 'Écart',        largeur: 70,  align: 'right' as const },
  { titre: 'Valeur stock', largeur: 105, align: 'right' as const },
];

export async function renderInventoryReportPdf(
  inv: InventoryPdfHeader, lines: InventoryPdfLine[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGE, layout: 'portrait' });
    const chunks: Buffer[] = [];
    doc.on('data', (b: Buffer) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const bas = doc.page.height - MARGE - 24;

    const enTeteColonnes = () => {
      const y = doc.y;
      let x = MARGE;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#555');
      for (const c of COLS_RAPPORT) {
        doc.text(c.titre.toUpperCase(), x, y,
          { width: c.largeur, align: c.align, lineBreak: false, ellipsis: true });
        x += c.largeur;
      }
      doc.y = y + 12;
      doc.fillColor('#000');
      trait(doc);
      doc.moveDown(0.3);
    };

    // Une ligne du tableau : cinq cellules alignées sur `COLS_RAPPORT`.
    const ligne = (
      cells: string[], opts: { gras?: boolean; couleurs?: (string | undefined)[] } = {},
    ) => {
      if (doc.y > bas - 16) { doc.addPage(); enTeteColonnes(); }
      const y = doc.y;
      let x = MARGE;
      for (let i = 0; i < COLS_RAPPORT.length; i++) {
        const c = COLS_RAPPORT[i]!;
        doc.font(opts.gras ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
          .fillColor(opts.couleurs?.[i] ?? '#000');
        doc.text(tronque(doc, cells[i] ?? '', c.largeur - 6), x, y,
          { width: c.largeur, align: c.align, lineBreak: false });
        x += c.largeur;
      }
      doc.fillColor('#000');
      doc.y = y + 16;
    };

    // --- Agrégats. Les lignes arrivent déjà triées par famille puis par nom.
    let ecartPlusLignes = 0, ecartMoinsLignes = 0;
    let ecartPlusUnites = 0, ecartMoinsUnites = 0;
    let regulNette = 0;          // Σ écart × PA — valeur des régularisations.
    let valeurTotale = 0;        // Σ compté × PA — stock final valorisé.
    let unitesComptees = 0;
    const parCategorie = new Map<string, { valeur: number; regul: number; lignes: number }>();

    for (const l of lines) {
      const attendu = Number(l.expected_qty);
      const compte = Number(l.counted_qty);
      const ecart = Number((compte - attendu).toFixed(3));
      const pa = Number(l.purchase_price_ht ?? 0);
      const valeur = Number((compte * pa).toFixed(2));
      const regul = Number((ecart * pa).toFixed(2));

      valeurTotale += valeur;
      regulNette += regul;
      unitesComptees += compte;
      if (ecart > 0) { ecartPlusLignes++; ecartPlusUnites += ecart; }
      else if (ecart < 0) { ecartMoinsLignes++; ecartMoinsUnites += ecart; }

      const cat = l.category_name ?? 'Sans catégorie';
      const agg = parCategorie.get(cat) ?? { valeur: 0, regul: 0, lignes: 0 };
      agg.valeur += valeur; agg.regul += regul; agg.lignes++;
      parCategorie.set(cat, agg);
    }

    // --- En-tête du document
    doc.font('Helvetica-Bold').fontSize(16).text(`Rapport d'inventaire — ${inv.label}`);
    doc.font('Helvetica').fontSize(9).fillColor('#555')
      .text(`${inv.store_name} · créé le ${new Date(inv.created_at).toLocaleString('fr-FR')}`);
    doc.text(`Édité le ${new Date().toLocaleString('fr-FR')}`);
    doc.fillColor('#000').moveDown(0.6);

    // --- Synthèse : ce qu'on relit en premier dans le dossier.
    const synthese = (etiquette: string, valeur: string, couleur = '#000') => {
      const y = doc.y;
      doc.font('Helvetica').fontSize(9).fillColor('#555')
        .text(etiquette, MARGE, y, { width: 320, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(couleur)
        .text(valeur, MARGE + 320, y,
          { width: doc.page.width - 2 * MARGE - 320, align: 'right', lineBreak: false });
      doc.fillColor('#000');
      doc.y = y + 14;
    };
    synthese(`Éléments comptés`, `${lines.length} produit(s) · ${nb(Number(unitesComptees.toFixed(3)))} unité(s)`);
    synthese('Écarts positifs',
      `+${nb(Number(ecartPlusUnites.toFixed(3)))} sur ${ecartPlusLignes} ligne(s)`,
      ecartPlusLignes ? '#2E7D32' : '#000');
    synthese('Écarts négatifs',
      `${nb(Number(ecartMoinsUnites.toFixed(3)))} sur ${ecartMoinsLignes} ligne(s)`,
      ecartMoinsLignes ? '#B3261E' : '#000');
    synthese('Régularisation nette (valorisée au PA HT)',
      eur(Number(regulNette.toFixed(2))), regulNette < 0 ? '#B3261E' : '#2E7D32');
    synthese('Valeur finale du stock (au PA HT)', eur(Number(valeurTotale.toFixed(2))));
    doc.moveDown(0.6);

    // --- Tableau détaillé, regroupé par famille.
    if (lines.length === 0) {
      doc.font('Helvetica').fontSize(10).fillColor('#555')
        .text('Aucune ligne comptée.', MARGE, doc.y + 10);
      doc.fillColor('#000');
      doc.end();
      return;
    }

    enTeteColonnes();
    let categorieCourante: string | null = null;
    for (const l of lines) {
      const cat = l.category_name ?? 'Sans catégorie';
      if (cat !== categorieCourante) {
        // Sous-total de la famille précédente, puis titre de la nouvelle.
        if (categorieCourante !== null) {
          const agg = parCategorie.get(categorieCourante)!;
          ligne(['', '', '', '', eur(Number(agg.valeur.toFixed(2)))],
            { gras: true, couleurs: ['#555', undefined, undefined, undefined, '#000'] });
        }
        if (doc.y > bas - 30) { doc.addPage(); enTeteColonnes(); }
        doc.moveDown(0.2);
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#1A1A1A')
          .text(cat, MARGE, doc.y, { width: doc.page.width - 2 * MARGE, lineBreak: false });
        doc.fillColor('#000');
        doc.y += 15;
        categorieCourante = cat;
      }

      const attendu = Number(l.expected_qty);
      const compte = Number(l.counted_qty);
      const ecart = Number((compte - attendu).toFixed(3));
      const valeur = Number((compte * Number(l.purchase_price_ht ?? 0)).toFixed(2));
      ligne(
        [l.product_name, nb(attendu), nb(compte),
          `${ecart > 0 ? '+' : ''}${nb(ecart)}`, eur(valeur)],
        { couleurs: ['#000', undefined, undefined, ecart < 0 ? '#B3261E' : ecart > 0 ? '#2E7D32' : '#555', undefined] },
      );
    }
    // Sous-total de la dernière famille.
    if (categorieCourante !== null) {
      const agg = parCategorie.get(categorieCourante)!;
      ligne(['', '', '', '', eur(Number(agg.valeur.toFixed(2)))],
        { gras: true, couleurs: ['#555', undefined, undefined, undefined, '#000'] });
    }

    // --- Total général.
    if (doc.y > bas - 24) { doc.addPage(); enTeteColonnes(); }
    doc.moveDown(0.4);
    trait(doc);
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fontSize(11)
      .text(`Valeur totale du stock : ${eur(Number(valeurTotale.toFixed(2)))}`,
        MARGE, doc.y, { width: doc.page.width - 2 * MARGE, align: 'right' });

    doc.end();
  });
}
