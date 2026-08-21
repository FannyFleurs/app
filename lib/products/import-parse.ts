import ExcelJS from 'exceljs';

/** Ligne brute issue du fichier d'import (avant validation métier). */
export interface RawImportRow {
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  sale_price_ttc: number | null;
  purchase_price_ht: number | null;
  tax_rate_code: string;
  color: string | null;
  is_top_product: boolean;
  visible_in_pos: boolean;
  is_active: boolean;
}

type ColKey =
  | 'name' | 'sku' | 'barcode' | 'category'
  | 'sale_price_ttc' | 'purchase_price_ht' | 'tax_rate_code'
  | 'color' | 'is_top_product' | 'visible_in_pos' | 'is_active';

/**
 * Colonnes du modèle d'import (entêtes en français, compréhensibles) + exemples.
 * Sert à la fois à générer le modèle XLSX et à mapper les entêtes du fichier.
 */
export const IMPORT_COLUMNS: Array<{
  key: ColKey; header: string; width: number; examples: [string, string, string];
}> = [
  { key: 'name',              header: 'Nom',                          width: 32, examples: ['Bougie parfumée', 'Écharpe en laine', 'Coffret cadeau'] },
  { key: 'sku',               header: 'Référence (SKU)',              width: 16, examples: ['DECO-001', 'MODE-002', 'CAD-003'] },
  { key: 'barcode',           header: 'Code-barres',                  width: 18, examples: ['3760000000011', '3760000000028', ''] },
  { key: 'category',          header: 'Catégorie',                    width: 22, examples: ['Décoration', 'Accessoires de mode', 'Cadeaux'] },
  { key: 'sale_price_ttc',    header: 'Prix de vente TTC (€)',        width: 18, examples: ['18,90', '45,00', '39,00'] },
  { key: 'purchase_price_ht', header: "Prix d'achat HT (€)",          width: 18, examples: ['7,50', '18,00', '16,00'] },
  { key: 'tax_rate_code',     header: 'Code TVA',                     width: 12, examples: ['TVA20', 'TVA20', 'TVA20'] },
  { key: 'color',             header: 'Couleur (#RRGGBB)',            width: 16, examples: ['#F4D7D7', '', ''] },
  { key: 'is_top_product',    header: 'Produit favori (oui/non)',     width: 20, examples: ['oui', 'non', 'non'] },
  { key: 'visible_in_pos',    header: 'Visible en caisse (oui/non)',  width: 24, examples: ['oui', 'oui', 'oui'] },
  { key: 'is_active',         header: 'Actif (oui/non)',              width: 12, examples: ['oui', 'oui', 'oui'] },
];

/** Normalise un entête : minuscules, sans accents, sans parenthèses ni ponctuation. */
function normHeader(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Synonymes acceptés (français nouveaux + anciens entêtes techniques anglais). */
const HEADER_ALIASES: Record<ColKey, string[]> = {
  name: ['nom', 'name', 'libelle', 'designation', 'produit', 'article'],
  sku: ['reference', 'reference sku', 'sku', 'ref'],
  barcode: ['code barres', 'code barre', 'barcode', 'ean', 'gencod', 'code_barres'],
  category: ['categorie', 'category', 'famille', 'rayon'],
  sale_price_ttc: ['prix de vente ttc', 'prix ttc', 'prix vente ttc', 'prix de vente', 'sale price ttc', 'prix_vente_ttc'],
  purchase_price_ht: ["prix d achat ht", 'prix achat ht', 'prix ht', 'cout', 'purchase price ht', 'prix_achat_ht'],
  tax_rate_code: ['code tva', 'taux de tva', 'taux tva', 'tva', 'tax rate code', 'tax_rate_code'],
  color: ['couleur', 'color'],
  is_top_product: ['produit favori', 'favori', 'coup de coeur', 'top', 'is top product', 'is_top_product'],
  visible_in_pos: ['visible en caisse', 'visible', 'affiche en caisse', 'is visible', 'visible in pos', 'visible_in_pos'],
  is_active: ['actif', 'active', 'statut', 'is active', 'is_active'],
};

const NORM_TO_KEY = new Map<string, ColKey>();
for (const key of Object.keys(HEADER_ALIASES) as ColKey[]) {
  for (const alias of HEADER_ALIASES[key]) NORM_TO_KEY.set(normHeader(alias), key);
}

function resolveHeaderKey(rawHeader: string): ColKey | null {
  return NORM_TO_KEY.get(normHeader(rawHeader)) ?? null;
}

function toBool(s: string): boolean {
  return /^(true|1|oui|yes|y|x|o)$/i.test(s.trim());
}
function toNum(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const v = Number(t.replace(/\s/g, '').replace(',', '.').replace(/€/g, ''));
  return Number.isFinite(v) ? v : NaN;
}

/** Construit une ligne à partir d'un accès (clé -> valeur texte). */
function buildRow(get: (k: ColKey) => string): RawImportRow {
  return {
    name: get('name'),
    sku: get('sku') || null,
    barcode: get('barcode') || null,
    category: get('category') || null,
    sale_price_ttc: toNum(get('sale_price_ttc')),
    purchase_price_ht: toNum(get('purchase_price_ht')),
    tax_rate_code: get('tax_rate_code') || 'TVA20',
    color: get('color') || null,
    is_top_product: get('is_top_product') ? toBool(get('is_top_product')) : false,
    visible_in_pos: get('visible_in_pos') ? toBool(get('visible_in_pos')) : true,
    is_active: get('is_active') ? toBool(get('is_active')) : true,
  };
}

/** Parse un CSV (séparateur , ou ;) avec entêtes FR ou EN. */
function parseCsv(csv: string): RawImportRow[] {
  const raw = csv.replace(/^﻿/, '').trim();
  const lines = raw.split(/\r?\n/);
  if (lines.length < 2) return [];
  const headerLine = lines[0]!;
  const sep = headerLine.includes(';') && !headerLine.includes(',') ? ';' : ',';

  function splitRow(line: string): string[] {
    const out: string[] = [];
    let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === sep && !inQ) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  const headerKeys = splitRow(headerLine).map((h) => resolveHeaderKey(h));
  const rows: RawImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const cols = splitRow(line);
    const byKey = new Map<ColKey, string>();
    headerKeys.forEach((k, j) => { if (k) byKey.set(k, (cols[j] ?? '').trim()); });
    rows.push(buildRow((k) => byKey.get(k) ?? ''));
  }
  return rows;
}

/** Parse un classeur XLSX (première feuille) avec entêtes FR ou EN. */
async function parseXlsx(buf: Buffer): Promise<RawImportRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const headerKeys = new Map<number, ColKey>();
  const headerRow = ws.getRow(1);
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    const k = resolveHeaderKey(String(cell.text ?? cell.value ?? ''));
    if (k) headerKeys.set(col, k);
  });

  const rows: RawImportRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const byKey = new Map<ColKey, string>();
    headerKeys.forEach((k, col) => {
      const cell = row.getCell(col);
      const text = cell.text != null ? String(cell.text) : (cell.value != null ? String(cell.value) : '');
      byKey.set(k, text.trim());
    });
    const built = buildRow((k) => byKey.get(k) ?? '');
    // Ignore les lignes entièrement vides.
    if (built.name || built.sku || built.barcode) rows.push(built);
  });
  return rows;
}

/** Détecte le format (XLSX vs CSV) et parse. Les .xlsx commencent par « PK ». */
export async function parseProductImport(buf: Buffer): Promise<RawImportRow[]> {
  if (buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b) {
    return parseXlsx(buf);
  }
  return parseCsv(buf.toString('utf8'));
}
