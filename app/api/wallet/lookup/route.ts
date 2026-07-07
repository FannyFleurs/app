import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { normalizeSerial } from '@/lib/wallet/apple-pass';

export const dynamic = 'force-dynamic';

/**
 * Resout un serial de carte fidelite scanne (Apple Wallet ou autre) vers
 * le customer_id correspondant, scope a l'organisation courante.
 *
 * Le lookup est normalise : on strip tout ce qui n'est pas alphanum et
 * on compare en MAJ. Ainsi un scan qui aurait ete mangle par le mapping
 * clavier (FID§XXXX§YYYY au lieu de FIDXXXXYYYY) retombe bien sur la
 * bonne carte.
 */
export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;

  const url = new URL(req.url);
  const raw = url.searchParams.get('serial') ?? '';
  const normalized = normalizeSerial(raw);
  if (!normalized || !normalized.startsWith('FID') || normalized.length < 6) {
    return NextResponse.json({ customer_id: null });
  }

  // Compare stored serial (potentiellement avec des '-') a l'input
  // apres normalisation des deux cotes.
  const r = await query<{ customer_id: string }>(
    `SELECT customer_id FROM wallet_passes
      WHERE organization_id = $1
        AND UPPER(REGEXP_REPLACE(serial_number, '[^A-Za-z0-9]', '', 'g')) = $2
      LIMIT 1`,
    [g.user.organizationId, normalized],
  );

  if (r.rowCount === 0) return NextResponse.json({ customer_id: null });
  return NextResponse.json({ customer_id: r.rows[0]!.customer_id });
}
