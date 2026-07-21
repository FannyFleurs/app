import { NextResponse } from 'next/server';
import { z } from 'zod';
import { cookies, headers } from 'next/headers';
import { query } from '@/lib/db/client';
import { parseJson, jsonError } from '@/lib/validation/api';
import { createSession, sessionCookieOptions } from '@/lib/auth/session';
import { resolvePairing } from '@/lib/services/pda-pairing';
import type { Role } from '@/lib/auth/rbac';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  code: z.string().min(3).max(40),
  device_id: z.string().min(8).max(80),
  device_name: z.string().max(80).optional(),
});

// Session PDA appairée : longue durée (~1 an).
const PDA_TTL_MIN = 365 * 24 * 60;

/**
 * POST /api/pda/pair
 * Appairage d'un PDA à une boutique via un code (saisi ou scanné en QR).
 * Ouvre une session longue durée pour l'utilisateur de service de la boutique.
 * Aucune session préalable requise (app dédiée, indépendante de la caisse).
 */
export async function POST(req: Request) {
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { code, device_id, device_name } = parsed.data;

  const pairing = await resolvePairing(code);
  if (!pairing) return jsonError('INVALID_CODE', 404);

  // Plusieurs PDA par boutique : chaque appareil (device_id) a sa propre
  // station. On numérote automatiquement les PDA d'une même boutique pour les
  // distinguer (renommables ensuite en BO).
  const cnt = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM label_stations
      WHERE organization_id = $1 AND store_id = $2 AND device_id <> $3`,
    [pairing.organization_id, pairing.store_id, device_id],
  );
  const others = Number(cnt.rows[0]?.n ?? '0');
  const autoName = others > 0 ? `PDA ${pairing.store_name} ${others + 1}` : `PDA ${pairing.store_name}`;

  // Rattache l'appareil à la boutique. Sur re-appairage du MÊME appareil, on
  // conserve son nom (pas d'écrasement).
  await query(
    `INSERT INTO label_stations (organization_id, store_id, device_id, name, last_seen_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (organization_id, device_id)
     DO UPDATE SET store_id = EXCLUDED.store_id, last_seen_at = now()`,
    [pairing.organization_id, pairing.store_id, device_id,
     device_name?.trim() || autoName],
  );

  const h = headers();
  const token = await createSession({
    userId: pairing.service_user_id,
    organizationId: pairing.organization_id,
    role: pairing.role as Role,
    kind: 'management',            // hors limite « poste de caisse »
    ttlMinutesOverride: PDA_TTL_MIN,
    ip: h.get('x-forwarded-for'),
    userAgent: h.get('user-agent'),
  });

  cookies().set({
    ...sessionCookieOptions(),
    value: token,
    maxAge: PDA_TTL_MIN * 60,     // cookie longue durée aligné sur la session
  });

  return NextResponse.json({ ok: true, store_name: pairing.store_name });
}
