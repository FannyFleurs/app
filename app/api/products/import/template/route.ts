import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/**
 * Renvoie le fichier modèle CSV pour l'import de produits.
 * Colonnes commentées sur la 1ʳᵉ ligne, exemples sur la 2ᵉ.
 */
export async function GET() {
  const g = await requirePermission('products.write');
  if ('response' in g) return g.response;

  const lines = [
    'name,sku,barcode,category,sale_price_ttc,purchase_price_ht,tax_rate_code,color,is_top_product,visible_in_pos,is_active',
    'Bouquet rond classique,BQT-001,3760000000001,Bouquets,35.00,12.50,TVA20,#F4D7D7,true,true,true',
    'Rose rouge longue tige,ROSE-RG,3760000000002,Fleurs coupées,3.50,1.20,TVA20,,false,true,true',
    'Composition florale baptême,COMP-BAP,,Compositions,55.00,18.00,TVA20,#F8E0CC,false,true,true',
  ];
  const csv = lines.join('\n') + '\n';
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="webpos-modele-import-produits.csv"',
    },
  });
}
