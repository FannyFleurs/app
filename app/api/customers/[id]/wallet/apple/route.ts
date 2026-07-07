import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import {
  generateLoyaltyPass,
  isConfigured,
  computeSerial,
  randomAuthToken,
  type PassSubject,
} from '@/lib/wallet/apple-pass';
import { mergeWithDefaults, POS_UI_KEY, type PosUiSettings } from '@/lib/settings/pos-ui';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

/**
 * Genere le .pkpass fidelite pour ce client et l'envoie en download.
 * Cree (ou reutilise) une ligne wallet_passes pour tracer le pass et
 * permettre les mises a jour push ulterieures.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('customers.read');
  if ('response' in g) return g.response;

  if (!isConfigured()) {
    return NextResponse.json(
      { error: 'WALLET_NOT_CONFIGURED',
        message: 'Certificat Apple Wallet manquant. Definir APPLE_WALLET_CERT_P12_B64, APPLE_WALLET_CERT_PASSWORD, APPLE_WALLET_WWDR_PEM_B64.' },
      { status: 503 },
    );
  }

  // 1. Charger le client + son organisation + solde fidelite.
  const cust = await query<{
    id: string; company_name: string | null; first_name: string | null;
    last_name: string | null; created_at: string;
  }>(
    `SELECT id, company_name, first_name, last_name, created_at
       FROM customers WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (cust.rowCount === 0) {
    return NextResponse.json({ error: 'CUSTOMER_NOT_FOUND' }, { status: 404 });
  }
  const c = cust.rows[0]!;
  const customerName = c.company_name
    || [c.first_name, c.last_name].filter(Boolean).join(' ')
    || 'Client fidélité';

  const org = await query<{ name: string }>(
    `SELECT name FROM organizations WHERE id = $1`,
    [g.user.organizationId],
  );

  const settingsRes = await query<{ value: Partial<PosUiSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [g.user.organizationId, POS_UI_KEY],
  );
  const posUi = mergeWithDefaults(settingsRes.rows[0]?.value ?? null);
  const walletCfg = posUi.loyalty.wallet;

  if (!posUi.loyalty.enabled || !walletCfg.enabled) {
    return NextResponse.json({ error: 'WALLET_DISABLED' }, { status: 400 });
  }
  if (!walletCfg.pass_type_id || !walletCfg.team_id) {
    return NextResponse.json({ error: 'WALLET_MISSING_IDS' }, { status: 400 });
  }

  // 2. Solde fidelite : 1 point = 1 euro (regle SaleService.validate).
  let balanceEuros = 0;
  let points = 0;
  try {
    const bal = await query<{ points_balance: number }>(
      `SELECT points_balance FROM loyalty_accounts
        WHERE customer_id = $1 AND organization_id = $2`,
      [params.id, g.user.organizationId],
    );
    points = Number(bal.rows[0]?.points_balance ?? 0);
    balanceEuros = points; // 1 point = 1 €
  } catch { /* table optionnelle : reste a 0 */ }

  // 3. Recupere / cree la ligne wallet_passes.
  const serial = computeSerial(params.id);
  const existing = await query<{ id: string; authentication_token: string }>(
    `SELECT id, authentication_token FROM wallet_passes
      WHERE provider = 'apple' AND serial_number = $1`,
    [serial],
  );
  let authToken: string;
  if (existing.rowCount && existing.rowCount > 0) {
    authToken = existing.rows[0]!.authentication_token;
    await query(
      `UPDATE wallet_passes SET updated_at = now() WHERE id = $1`,
      [existing.rows[0]!.id],
    );
  } else {
    authToken = randomAuthToken();
    await query(
      `INSERT INTO wallet_passes
         (organization_id, customer_id, provider, serial_number,
          authentication_token, pass_type_id)
       VALUES ($1, $2, 'apple', $3, $4, $5)`,
      [g.user.organizationId, params.id, serial, authToken, walletCfg.pass_type_id],
    );
  }

  // 4. Genere le .pkpass.
  const subject: PassSubject = {
    customerId: params.id,
    customerName,
    organizationName: org.rows[0]?.name ?? walletCfg.logo_text ?? 'Boutique',
    loyaltyBalanceEuros: balanceEuros,
    loyaltyPoints: walletCfg.show_points ? points : null,
    memberSince: new Date(c.created_at),
    serialNumber: serial,
    authenticationToken: authToken,
  };

  let pkpass: Buffer;
  try {
    pkpass = await generateLoyaltyPass(subject, walletCfg);
  } catch (err) {
    const msg = (err as Error).message ?? 'PASS_GENERATION_FAILED';
    // eslint-disable-next-line no-console
    console.error('[wallet.apple.generate]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  await audit({
    organizationId: g.user.organizationId,
    userId: g.user.id,
    action: 'wallet.apple.generate',
    entityType: 'customer',
    entityId: params.id,
    payload: { serial },
  });

  // Encapsule le Buffer dans une Response native pour eviter le
  // detour JSON.stringify de NextResponse.json.
  return new Response(pkpass, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename="fidelite-${serial}.pkpass"`,
      'Cache-Control': 'no-store',
    },
  });
}
