import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { verifyWalletToken } from '@/lib/wallet/link-token';
import {
  generateLoyaltyPass,
  isConfigured,
  computeSerial,
  randomAuthToken,
  type PassSubject,
} from '@/lib/wallet/apple-pass';
import { mergeWithDefaults, POS_UI_KEY, type PosUiSettings } from '@/lib/settings/pos-ui';

export const dynamic = 'force-dynamic';

/**
 * Endpoint PUBLIC (aucune session) : le client ouvre ce lien depuis
 * son iPhone → Apple Wallet s'ouvre directement avec la carte.
 * Seule protection : le token JWT signe qui encode (org × client × exp).
 */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  if (!isConfigured()) {
    return htmlError(
      'Carte fidélité indisponible',
      'La configuration Apple Wallet n\'est pas encore en place. Revenez plus tard ou contactez la boutique.',
    );
  }

  const claims = await verifyWalletToken(params.token);
  if (!claims) {
    return htmlError(
      'Lien expiré',
      'Ce lien n\'est plus valide. Demandez à la boutique de vous en envoyer un nouveau.',
    );
  }

  const cust = await query<{
    id: string; company_name: string | null; first_name: string | null;
    last_name: string | null; created_at: string;
  }>(
    `SELECT id, company_name, first_name, last_name, created_at
       FROM customers WHERE id = $1 AND organization_id = $2`,
    [claims.customerId, claims.orgId],
  );
  if (cust.rowCount === 0) {
    return htmlError('Introuvable', 'Client introuvable.');
  }
  const c = cust.rows[0]!;
  const customerName = c.company_name
    || [c.first_name, c.last_name].filter(Boolean).join(' ')
    || 'Client fidélité';

  const org = await query<{ name: string }>(
    `SELECT name FROM organizations WHERE id = $1`, [claims.orgId],
  );

  const settingsRes = await query<{ value: Partial<PosUiSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [claims.orgId, POS_UI_KEY],
  );
  const posUi = mergeWithDefaults(settingsRes.rows[0]?.value ?? null);
  const walletCfg = posUi.loyalty.wallet;

  if (!posUi.loyalty.enabled || !walletCfg.enabled) {
    return htmlError(
      'Programme non actif',
      'La carte fidélité n\'est pas activée par cette boutique.',
    );
  }
  if (!walletCfg.pass_type_id || !walletCfg.team_id) {
    return htmlError(
      'Configuration incomplète',
      'La boutique doit renseigner son Pass Type ID et Team ID.',
    );
  }

  let balanceEuros = 0, points = 0;
  try {
    const bal = await query<{ points_balance: number }>(
      `SELECT points_balance FROM loyalty_accounts
        WHERE customer_id = $1 AND organization_id = $2`,
      [claims.customerId, claims.orgId],
    );
    points = Number(bal.rows[0]?.points_balance ?? 0);
    balanceEuros = points;
  } catch { /* ignore */ }

  const serial = computeSerial(claims.customerId);
  const existing = await query<{ id: string; authentication_token: string }>(
    `SELECT id, authentication_token FROM wallet_passes
      WHERE provider='apple' AND serial_number = $1`,
    [serial],
  );
  let authToken: string;
  if (existing.rowCount && existing.rowCount > 0) {
    authToken = existing.rows[0]!.authentication_token;
    await query(`UPDATE wallet_passes SET updated_at = now() WHERE id = $1`,
      [existing.rows[0]!.id]);
  } else {
    authToken = randomAuthToken();
    await query(
      `INSERT INTO wallet_passes
         (organization_id, customer_id, provider, serial_number,
          authentication_token, pass_type_id)
       VALUES ($1, $2, 'apple', $3, $4, $5)`,
      [claims.orgId, claims.customerId, serial, authToken, walletCfg.pass_type_id],
    );
  }

  const subject: PassSubject = {
    customerId: claims.customerId,
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
    // eslint-disable-next-line no-console
    console.error('[wallet.public]', err);
    return htmlError(
      'Erreur',
      'Impossible de générer la carte fidélité pour le moment. Réessayez plus tard.',
    );
  }

  return new Response(pkpass, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename="fidelite.pkpass"`,
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * En cas d'erreur, on renvoie une page HTML minimaliste — le client
 * arrive ici sans savoir qu'il y a un souci. Le HTML est adapte au
 * mobile (viewport meta) et lisible sans CSS externe.
 */
function htmlError(title: string, message: string): Response {
  const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
           margin: 0; padding: 40px 24px; color: #1F2A24; background: #F6F4EE;
           min-height: 100vh; display: grid; place-items: center; }
    .card { max-width: 420px; background: #FFF; border-radius: 20px; padding: 32px 28px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.06); text-align: center; }
    h1 { margin: 0 0 12px; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
    p { color: #5C625C; line-height: 1.5; margin: 0; font-size: 15px; }
    .badge { display: inline-block; padding: 6px 12px; background: #EFF4EA;
             color: #556B3E; border-radius: 999px; font-size: 12px; font-weight: 600;
             letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Fidélité</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}
