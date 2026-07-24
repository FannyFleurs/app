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

  // 1) Carte émise via Apple/Google Wallet : le serial est stocké dans
  // wallet_passes. Compare stored serial (potentiellement avec des '-') à
  // l'input après normalisation des deux côtés.
  const r = await query<{ customer_id: string }>(
    `SELECT customer_id FROM wallet_passes
      WHERE organization_id = $1
        AND UPPER(REGEXP_REPLACE(serial_number, '[^A-Za-z0-9]', '', 'g')) = $2
      LIMIT 1`,
    [g.user.organizationId, normalized],
  );
  if (r.rowCount && r.rows[0]) {
    return NextResponse.json({ customer_id: r.rows[0].customer_id });
  }

  // 2) Repli : le serial est DÉTERMINISTE — "FID" + 8 premiers caractères
  // hexa de l'UUID client (cf. computeSerial). On retrouve donc n'importe
  // quel client par ses 8 premiers hexa, même s'il n'a JAMAIS généré de
  // carte Wallet (carte fidélité imprimée classique). Sans ce repli, un
  // scan FID ne « faisait rien » tant qu'aucun pass n'existait.
  const hex8 = normalized.slice(3, 11);
  if (hex8.length === 8) {
    const c = await query<{ id: string }>(
      `SELECT id FROM customers
        WHERE organization_id = $1
          AND UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 8)) = $2
        LIMIT 2`,
      [g.user.organizationId, hex8],
    );
    // Un seul match attendu : en cas d'ambiguïté (collision improbable sur
    // 32 bits), on ne devine pas.
    if (c.rowCount === 1 && c.rows[0]) {
      return NextResponse.json({ customer_id: c.rows[0].id });
    }
  }

  return NextResponse.json({ customer_id: null });
}
