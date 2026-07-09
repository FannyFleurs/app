import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query, withTransaction } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { planLimits, effectivePlan } from '@/lib/billing/plan-limits';

/** Plan effectif de l'organisation (subscription > organizations). */
async function orgPlan(orgId: string): Promise<string> {
  try {
    const r = await query<{ sub_plan: string | null; org_plan: string | null }>(
      `SELECT s.plan AS sub_plan, o.plan AS org_plan
         FROM organizations o
         LEFT JOIN subscriptions s ON s.organization_id = o.id
        WHERE o.id = $1`,
      [orgId],
    );
    return effectivePlan(r.rows[0]?.sub_plan ?? null, r.rows[0]?.org_plan ?? null);
  } catch {
    return 'trial';
  }
}

const schema = z.object({
  code: z.string().max(40).optional(),
  name: z.string().min(1).max(120),
  address: z.object({
    line1: z.string().max(160).optional(),
    zip: z.string().max(20).optional(),
    city: z.string().max(120).optional(),
    country: z.string().max(80).optional(),
  }).optional(),
});

/**
 * Genere un code court alphanumerique unique pour une boutique dans
 * l'organisation : B1, B2, B3... on prend le prochain libre.
 */
async function nextStoreCode(orgId: string, client: { query: typeof query }): Promise<string> {
  const r = await client.query<{ next: number }>(
    `SELECT COALESCE(MAX(NULLIF(regexp_replace(code, '\\D', '', 'g'), '')::int), 0) + 1 AS next
       FROM stores
      WHERE organization_id = $1 AND code ~ '^B[0-9]+$'`,
    [orgId],
  );
  return `B${r.rows[0]?.next ?? 1}`;
}

/**
 * Genere un code court unique pour une caisse : C1, C2... dans la boutique.
 */
async function nextRegisterCode(storeId: string, client: { query: typeof query }): Promise<string> {
  const r = await client.query<{ next: number }>(
    `SELECT COALESCE(MAX(NULLIF(regexp_replace(code, '\\D', '', 'g'), '')::int), 0) + 1 AS next
       FROM registers
      WHERE store_id = $1 AND code ~ '^C[0-9]+$'`,
    [storeId],
  );
  return `C${r.rows[0]?.next ?? 1}`;
}

export async function GET() {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;
  const { rows } = await query(
    `SELECT id, code, name, address, is_active
       FROM stores WHERE organization_id = $1
       ORDER BY name`,
    [g.user.organizationId],
  );
  return NextResponse.json({ stores: rows });
}

export async function POST(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  // Limite d'offre : nombre de boutiques.
  const limits = planLimits(await orgPlan(g.user.organizationId));
  if (Number.isFinite(limits.maxStores)) {
    const cnt = await query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM stores WHERE organization_id = $1`,
      [g.user.organizationId],
    );
    if (Number(cnt.rows[0]?.c ?? 0) >= limits.maxStores) {
      return NextResponse.json({
        error: 'PLAN_LIMIT_REACHED',
        message: `Votre offre ${limits.label} est limitée à ${limits.maxStores} boutique(s). Passez à une offre supérieure pour en ajouter.`,
      }, { status: 403 });
    }
  }

  try {
    const result = await withTransaction(async (client) => {
      // Code : soit fourni, soit auto-genere (B1, B2...).
      const code = d.code?.trim() || await nextStoreCode(g.user.organizationId, client);

      const store = await client.query<{ id: string; code: string }>(
        `INSERT INTO stores (organization_id, code, name, address, is_active)
         VALUES ($1, $2, $3, $4, TRUE) RETURNING id, code`,
        [g.user.organizationId, code, d.name, JSON.stringify(d.address ?? {})],
      );
      const storeId = store.rows[0]!.id;

      // Premiere caisse creee automatiquement, code C1, nom "Caisse 1".
      const regCode = await nextRegisterCode(storeId, client);
      const register = await client.query<{ id: string; code: string }>(
        `INSERT INTO registers (organization_id, store_id, code, name, is_active)
         VALUES ($1, $2, $3, $4, TRUE) RETURNING id, code`,
        [g.user.organizationId, storeId, regCode, `Caisse ${regCode.replace(/\D/g, '')}`],
      );

      return {
        id: storeId,
        code: store.rows[0]!.code,
        register: {
          id: register.rows[0]!.id,
          code: register.rows[0]!.code,
        },
      };
    });

    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'stores.create', entityType: 'store', entityId: result.id,
      payload: { ...d, code: result.code, auto_register: result.register.code },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const m = (err as Error).message ?? '';
    if (m.includes('duplicate')) return jsonError('CODE_ALREADY_EXISTS', 409);
    // eslint-disable-next-line no-console
    console.error('[stores.create]', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: m }, { status: 500 });
  }
}
