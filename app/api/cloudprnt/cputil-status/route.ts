import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guards';
import { diagnostiquerCputil } from '@/lib/services/cloudprnt/cputil';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * État de CPUtil dans l'environnement d'exécution RÉEL.
 *
 * Depuis un poste de développement, le binaire est là et fonctionne. Sur une
 * lambda, il peut manquer au déploiement, avoir perdu son droit d'exécution,
 * ou refuser de démarrer — trois causes qui donnent le même « échec de
 * l'envoi » à l'écran. Cette route les distingue.
 */
export async function GET() {
  const g = await requirePermission('products.read');
  if ('response' in g) return g.response;
  return NextResponse.json(await diagnostiquerCputil());
}
