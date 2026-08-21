import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseProductImport } from '@/lib/products/import-parse';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

  // Fichier reçu en binaire : Excel (.xlsx) OU CSV. Le format est détecté par
  // parseProductImport (les .xlsx commencent par « PK »). Compat JSON legacy.
  const ct = req.headers.get('content-type') || '';
  let buf: Buffer;
  if (ct.includes('application/json')) {
    const body = await req.json();
    buf = Buffer.from(String(body.csv ?? ''), 'utf8');
  } else {
    buf = Buffer.from(await req.arrayBuffer());
  }
  if (buf.length === 0) {
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

  const rows = await parseProductImport(buf);
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
