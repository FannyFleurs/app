import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import {
  generateLoyaltyPass,
  isConfigured,
  type PassSubject,
} from '@/lib/wallet/apple-pass';
import { mergeWithDefaults, POS_UI_KEY, type PosUiSettings } from '@/lib/settings/pos-ui';

export const dynamic = 'force-dynamic';

/**
 * PassKit Web Service — return the latest .pkpass for this serial.
 * Called by the iPhone after it receives an APNs push notifying a
 * change. Auth: Authorization: ApplePass <authenticationToken>.
 *
 * Honors If-Modified-Since header (returns 304 when unchanged).
 */

interface Params { passTypeId: string; serial: string }

function extractAuthToken(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  const m = h.match(/^ApplePass\s+(.+)$/i);
  return m ? m[1]!.trim() : null;
}

export async function GET(req: Request, { params }: { params: Params }) {
  if (!isConfigured()) return new NextResponse(null, { status: 503 });

  const pass = await query<{
    id: string; customer_id: string; organization_id: string;
    authentication_token: string; updated_at: string;
  }>(
    `SELECT id, customer_id, organization_id, authentication_token, updated_at
       FROM wallet_passes
      WHERE provider='apple' AND pass_type_id = $1 AND serial_number = $2`,
    [params.passTypeId, params.serial],
  );
  const p = pass.rows[0];
  if (!p) return new NextResponse(null, { status: 404 });
  if (extractAuthToken(req) !== p.authentication_token) {
    return new NextResponse(null, { status: 401 });
  }

  // If-Modified-Since (Apple envoie ce header pour eviter les
  // re-signatures inutiles).
  const ifMod = req.headers.get('if-modified-since');
  if (ifMod) {
    const since = new Date(ifMod);
    if (!isNaN(since.getTime()) && new Date(p.updated_at) <= since) {
      return new NextResponse(null, { status: 304 });
    }
  }

  // Reconstruit le sujet pour re-generer le pass a jour.
  const cust = await query<{
    company_name: string | null; first_name: string | null;
    last_name: string | null; created_at: string;
  }>(
    `SELECT company_name, first_name, last_name, created_at
       FROM customers WHERE id = $1`,
    [p.customer_id],
  );
  const c = cust.rows[0];
  if (!c) return new NextResponse(null, { status: 410 });
  const customerName = c.company_name
    || [c.first_name, c.last_name].filter(Boolean).join(' ')
    || 'Client fidélité';

  const org = await query<{ name: string }>(
    `SELECT name FROM organizations WHERE id = $1`,
    [p.organization_id],
  );

  const settingsRes = await query<{ value: Partial<PosUiSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [p.organization_id, POS_UI_KEY],
  );
  const posUi = mergeWithDefaults(settingsRes.rows[0]?.value ?? null);

  let balanceEuros = 0, points = 0;
  try {
    const bal = await query<{ points_balance: number }>(
      `SELECT points_balance FROM loyalty_accounts
        WHERE customer_id = $1 AND organization_id = $2`,
      [p.customer_id, p.organization_id],
    );
    points = Number(bal.rows[0]?.points_balance ?? 0);
    balanceEuros = points; // 1 point = 1 €
  } catch { /* pas de table : reste a 0 */ }

  const subject: PassSubject = {
    customerId: p.customer_id,
    customerName,
    organizationName: org.rows[0]?.name ?? posUi.loyalty.wallet.logo_text ?? 'Boutique',
    loyaltyBalanceEuros: balanceEuros,
    loyaltyPoints: posUi.loyalty.wallet.show_points ? points : null,
    memberSince: new Date(c.created_at),
    serialNumber: params.serial,
    authenticationToken: p.authentication_token,
  };

  let pkpass: Buffer;
  try {
    pkpass = await generateLoyaltyPass(subject, posUi.loyalty.wallet);
  } catch {
    return new NextResponse(null, { status: 500 });
  }

  return new Response(pkpass, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.apple.pkpass',
      'Last-Modified': new Date(p.updated_at).toUTCString(),
      'Cache-Control': 'no-store',
    },
  });
}
