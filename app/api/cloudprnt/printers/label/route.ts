import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guards';
import { resolveLabelPrinter } from '@/lib/services/cloudprnt/queue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Imprimante d'étiquettes active pour une boutique — lecture minimale.
 *
 * Pourquoi cette route existe : la liste complète des imprimantes
 * (`/api/cloudprnt/printers`) exige la permission `settings.read`, que les
 * utilisateurs de la caisse n'ont pas. Or l'IMPRESSION, elle, ne demande que
 * `products.read`. Résultat : la caisse pouvait imprimer, mais ne parvenait
 * pas à savoir qu'une imprimante existait, et retombait donc sur l'impression
 * PDF du navigateur.
 *
 * On expose ici le strict nécessaire — le nom de l'imprimante retenue — avec
 * la même permission que l'impression. Ni adresse MAC, ni jeton de sondage.
 */
export async function GET(req: Request) {
  const g = await requirePermission('products.read');
  if ('response' in g) return g.response;

  const storeId = new URL(req.url).searchParams.get('store_id');
  const printer = await resolveLabelPrinter(g.user.organizationId, storeId || null);

  return NextResponse.json({
    printer: printer ? { label: printer.label } : null,
  });
}
