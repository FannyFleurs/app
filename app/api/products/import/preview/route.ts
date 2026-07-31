import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

interface ParsedRow {
  line: number;
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
  errors: string[];
  warnings: string[];
}

/**
 * Parse + valide un CSV de produits SANS les insérer.
 * Renvoie une liste lignes avec erreurs / warnings par ligne, utilisée
 * pour la prévisualisation côté UI avant commit.
 */
export async function POST(req: Request) {
  const g = await requirePermission('products.write');
  if ('response' in g) return g.response;

  const ct = req.headers.get('content-type') || '';
  let csv: string;
  if (ct.includes('application/json')) {
    const body = await req.json();
    csv = String(body.csv ?? '');
  } else {
    csv = await req.text();
  }
  if (!csv.trim()) {
    return NextResponse.json({ rows: [], errors: 0, total: 0 });
  }

  // Catégories existantes (par nom, insensible à la casse) + taux de TVA
  const [catRes, taxRes, existingBarcodes, existingSkus] = await Promise.all([
    query<{ id: string; name: string }>(
      `SELECT id, name FROM product_categories WHERE organization_id = $1`,
      [g.user.organizationId],
    ),
    query<{ id: string; code: string }>(
      `SELECT id, code FROM tax_rates WHERE organization_id = $1`,
      [g.user.organizationId],
    ),
    query<{ barcode: string }>(
      `SELECT barcode FROM products WHERE organization_id = $1 AND barcode IS NOT NULL`,
      [g.user.organizationId],
    ),
    query<{ sku: string }>(
      `SELECT sku FROM products WHERE organization_id = $1 AND sku IS NOT NULL`,
      [g.user.organizationId],
    ),
  ]);
  const categoriesByName = new Map(
    catRes.rows.map((c) => [c.name.trim().toLowerCase(), c.id]),
  );
  const taxByCode = new Map(taxRes.rows.map((t) => [t.code.toUpperCase(), t.id]));
  const barcodesInDb = new Set(existingBarcodes.rows.map((r) => r.barcode));
  const skusInDb = new Set(existingSkus.rows.map((r) => r.sku));

  const rows = parseCsv(csv);
  // Garde-fou mémoire : plafond large par import (catalogues volumineux).
  const MAX_IMPORT = 20000;
  const truncated = rows.length > MAX_IMPORT;
  const limited = truncated ? rows.slice(0, MAX_IMPORT) : rows;

  // Dedup intra-fichier : on signale les doublons sku/barcode dans LE CSV
  const seenBarcodes = new Map<string, number[]>();
  const seenSkus = new Map<string, number[]>();
  limited.forEach((r, idx) => {
    if (r.barcode) {
      const arr = seenBarcodes.get(r.barcode) ?? [];
      arr.push(idx);
      seenBarcodes.set(r.barcode, arr);
    }
    if (r.sku) {
      const arr = seenSkus.get(r.sku) ?? [];
      arr.push(idx);
      seenSkus.set(r.sku, arr);
    }
  });

  const validated: ParsedRow[] = limited.map((r, idx) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!r.name?.trim()) errors.push('Nom obligatoire');
    if (r.name && r.name.length > 300) {
      errors.push(`Nom trop long (${r.name.length} caractères, max 300)`);
    }
    if (r.sale_price_ttc == null || Number.isNaN(r.sale_price_ttc)) {
      errors.push('Prix de vente TTC invalide');
    } else if (r.sale_price_ttc < 0) {
      errors.push('Prix de vente TTC négatif');
    }
    if (r.purchase_price_ht != null && r.purchase_price_ht < 0) {
      errors.push('Prix d\'achat HT négatif');
    }
    if (!taxByCode.has(r.tax_rate_code.toUpperCase())) {
      errors.push(`Code TVA inconnu : ${r.tax_rate_code}`);
    }
    if (r.color && !/^#[0-9a-fA-F]{6}$/.test(r.color)) {
      errors.push(`Couleur invalide (attendu #RRGGBB) : ${r.color}`);
    }
    if (r.sku && r.sku.length > 200) {
      errors.push(`SKU trop long (${r.sku.length} caractères, max 200)`);
    }
    if (r.barcode && r.barcode.length > 100) {
      errors.push(`Code-barres trop long (${r.barcode.length} caractères, max 100)`);
    }
    if (r.category && r.category.length > 200) {
      errors.push(`Catégorie trop longue (${r.category.length} caractères, max 200)`);
    }
    if (r.category && !categoriesByName.has(r.category.trim().toLowerCase())) {
      warnings.push(`Catégorie « ${r.category} » sera créée automatiquement`);
    }
    if (r.barcode && barcodesInDb.has(r.barcode)) {
      errors.push(`Code-barres déjà utilisé en base : ${r.barcode}`);
    }
    if (r.sku && skusInDb.has(r.sku)) {
      errors.push(`SKU déjà utilisé en base : ${r.sku}`);
    }
    if (r.barcode && (seenBarcodes.get(r.barcode)?.length ?? 0) > 1) {
      errors.push(`Code-barres dupliqué dans le fichier : ${r.barcode}`);
    }
    if (r.sku && (seenSkus.get(r.sku)?.length ?? 0) > 1) {
      errors.push(`SKU dupliqué dans le fichier : ${r.sku}`);
    }

    return {
      line: idx + 2, // +1 pour l'index, +1 pour la ligne d'en-têtes
      ...r,
      errors,
      warnings,
    };
  });

  const errorCount = validated.filter((r) => r.errors.length > 0).length;

  return NextResponse.json({
    rows: validated,
    errors: errorCount,
    total: validated.length,
    truncated,
  });
}

/**
 * Parse un CSV simple (séparateur , ou ;). Gère les guillemets pour
 * les valeurs contenant des virgules. Retourne un tableau d'objets
 * partiels à valider ensuite.
 */
function parseCsv(csv: string): Array<{
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
}> {
  const raw = csv.replace(/^﻿/, '').trim();
  const lines = raw.split(/\r?\n/);
  if (lines.length < 2) return [];

  // Détecte séparateur (, ou ;)
  const headerLine = lines[0]!;
  const sep = headerLine.includes(';') && !headerLine.includes(',') ? ';' : ',';

  function splitRow(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"'; i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === sep && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  }

  const headers = splitRow(headerLine).map((h) => h.toLowerCase().trim());
  const idx = (name: string) => headers.indexOf(name);

  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const cols = splitRow(line);
    const get = (col: string) => {
      const j = idx(col);
      return j === -1 ? '' : (cols[j] ?? '').trim();
    };
    const toBool = (s: string) => /^(true|1|oui|yes|y|x)$/i.test(s);
    const toNum = (s: string): number | null => {
      if (!s) return null;
      const v = Number(s.replace(',', '.'));
      return Number.isFinite(v) ? v : NaN;
    };

    out.push({
      name: get('name') || get('nom'),
      sku: get('sku') || null,
      barcode: get('barcode') || get('code_barres') || null,
      category: get('category') || get('categorie') || null,
      sale_price_ttc: toNum(get('sale_price_ttc') || get('prix_vente_ttc')),
      purchase_price_ht: toNum(get('purchase_price_ht') || get('prix_achat_ht')),
      tax_rate_code: get('tax_rate_code') || get('tva') || 'TVA20',
      color: get('color') || null,
      is_top_product: get('is_top_product') ? toBool(get('is_top_product')) : false,
      visible_in_pos: get('visible_in_pos') ? toBool(get('visible_in_pos')) : true,
      is_active: get('is_active') ? toBool(get('is_active')) : true,
    });
  }
  return out;
}
