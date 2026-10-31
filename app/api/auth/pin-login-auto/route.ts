import { z } from 'zod';
import { cookies, headers } from 'next/headers';
import { query } from '@/lib/db/client';
import { openPinSession } from '@/lib/auth/pin-session';
import { findUsersByPin } from '@/lib/auth/pin-match';
import { readTenantCookie } from '@/lib/auth/tenant';
import { audit } from '@/lib/audit/log';
import { parseJson, jsonError } from '@/lib/validation/api';

/**
 * Connexion caisse par PIN SEUL, sans choisir de profil au préalable : on
 * tape directement son code sur l'écran de connexion, et le compte qui a ce
 * PIN est identifié et connecté — voir PinLogin.tsx (saisie clavier globale
 * tant qu'aucune tuile n'est sélectionnée).
 *
 * Le périmètre de recherche est EXACTEMENT celui de /api/users/select (même
 * poste = mêmes comptes proposés sur l'écran de tuiles) : organisation du
 * poste appairé (ou cookie tenant), boutique de ce poste le cas échéant.
 */
const schema = z.object({ pin: z.string().regex(/^\d{4}$/) });

// Anti-bruteforce PAR POSTE (pas par compte, puisqu'on ne sait pas encore
// QUI on teste tant qu'aucun PIN ne correspond) : au-delà de MAX_ATTEMPTS
// échecs sur CE poste dans les LOCK_MINUTES dernières minutes, on bloque
// temporairement la détection automatique. La connexion « je choisis mon
// profil puis je tape mon code » reste ouverte, elle, limitée PAR compte
// comme avant (pin-login/route.ts, inchangé).
const MAX_ATTEMPTS = 8;
const LOCK_MINUTES = 15;
const FAILED_ACTION = 'auth.pin_login_auto.failed';

export async function POST(req: Request) {
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { pin } = parsed.data;

  const ua = headers().get('user-agent');
  const ip = headers().get('x-forwarded-for')?.split(',')[0]?.trim() || headers().get('x-real-ip') || null;
  const deviceId = cookies().get('webpos_device_id')?.value ?? null;

  // Résout organisation + boutique comme /api/users/select : poste appairé
  // (device_id → registers) en priorité, sinon le cookie tenant, sinon le
  // repli mono-organisation.
  let tenantId: string | null = readTenantCookie();
  let storeId: string | null = null;
  if (deviceId) {
    try {
      const reg = await query<{ organization_id: string; store_id: string }>(
        `SELECT organization_id, store_id FROM registers WHERE device_id = $1 AND is_active = TRUE LIMIT 1`,
        [deviceId],
      );
      if (reg.rows[0]) {
        tenantId = tenantId ?? reg.rows[0].organization_id;
        storeId = reg.rows[0].store_id;
      }
    } catch { /* migration device_id absente */ }
  }
  if (!tenantId) {
    try {
      const orgs = await query<{ id: string }>(`SELECT id FROM organizations LIMIT 2`);
      if (orgs.rowCount === 1) tenantId = orgs.rows[0]!.id;
    } catch { /* ignore */ }
  }
  if (!tenantId) return jsonError('INVALID_PIN', 401);

  const recent = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM audit_logs
      WHERE organization_id = $1 AND action = $2
        AND created_at > now() - interval '${LOCK_MINUTES} minutes'
        AND (
          ($3::text IS NOT NULL AND payload->>'device_id' = $3)
          OR ($3::text IS NULL AND ip = $4::inet)
        )`,
    [tenantId, FAILED_ACTION, deviceId, ip],
  );
  if (Number(recent.rows[0]?.count ?? 0) >= MAX_ATTEMPTS) {
    return jsonError('TOO_MANY_ATTEMPTS', 429, { until_minutes: LOCK_MINUTES });
  }

  const matches = await findUsersByPin(tenantId, storeId, pin);

  if (matches.length === 0) {
    await audit({
      organizationId: tenantId, userId: null, action: FAILED_ACTION,
      ip, userAgent: ua, payload: { device_id: deviceId, store_id: storeId, reason: 'no_match' }, severity: 'security',
    });
    return jsonError('INVALID_PIN', 401);
  }
  if (matches.length > 1) {
    // Deux comptes partagent le même PIN sur ce poste : on refuse de
    // deviner — l'utilisateur choisit sa tuile puis tape son code comme
    // avant (flux manuel, non ambigu car ciblé sur UN compte).
    await audit({
      organizationId: tenantId, userId: null, action: FAILED_ACTION,
      ip, userAgent: ua, payload: { device_id: deviceId, store_id: storeId, reason: 'ambiguous', count: matches.length }, severity: 'security',
    });
    return jsonError('AMBIGUOUS_PIN', 409);
  }

  return openPinSession(matches[0]!, ip, ua, 'auth.pin_login_auto.ok', { store_id: storeId, device_id: deviceId });
}
