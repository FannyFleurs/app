import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { planLimits, effectivePlan } from '@/lib/billing/plan-limits';

async function orgPlanInfo(orgId: string): Promise<{ plan: string; extra: number }> {
  try {
    const r = await query<{ sub_plan: string | null; org_plan: string | null; extra: number | null }>(
      `SELECT s.plan AS sub_plan, o.plan AS org_plan, s.extra_registers AS extra
         FROM organizations o
         LEFT JOIN subscriptions s ON s.organization_id = o.id
        WHERE o.id = $1`,
      [orgId],
    );
    return {
      plan: effectivePlan(r.rows[0]?.sub_plan ?? null, r.rows[0]?.org_plan ?? null),
      extra: Number(r.rows[0]?.extra ?? 0) || 0,
    };
  } catch {
    return { plan: 'trial', extra: 0 };
  }
}

const schema = z.object({
  store_id: z.string().uuid(),
  code: z.string().max(40).optional(),
  name: z.string().max(120).optional(),
});

/**
 * Genere un code court unique pour une caisse : C1, C2... dans la boutique.
 */
async function nextRegisterCode(storeId: string): Promise<string> {
  const r = await query<{ next: number }>(
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
    `SELECT r.id, r.code, r.name, r.store_id, r.is_active,
            r.device_id, r.device_name, r.bound_at,
            s.name AS store_name
       FROM registers r
       JOIN stores s ON s.id = r.store_id
      WHERE r.organization_id = $1
      ORDER BY s.name, r.name`,
    [g.user.organizationId],
  );
  return NextResponse.json({ registers: rows });
}

export async function POST(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  try {
    // Verifie que la boutique appartient bien a l'org.
    const storeCheck = await query(
      `SELECT 1 FROM stores WHERE id = $1 AND organization_id = $2`,
      [d.store_id, g.user.organizationId],
    );
    if (storeCheck.rowCount === 0) return jsonError('STORE_NOT_FOUND', 404);

    // Limite d'offre : nombre de caisses par boutique (+ options).
    const info = await orgPlanInfo(g.user.organizationId);
    const limits = planLimits(info.plan, info.extra);
    if (Number.isFinite(limits.maxRegistersPerStore)) {
      const cnt = await query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM registers WHERE store_id = $1`,
        [d.store_id],
      );
      if (Number(cnt.rows[0]?.c ?? 0) >= limits.maxRegistersPerStore) {
        return NextResponse.json({
          error: 'PLAN_LIMIT_REACHED',
          message: `Votre offre ${limits.label} est limitée à ${limits.maxRegistersPerStore} caisse(s) par boutique. Passez à l'offre Croissance pour des caisses illimitées.`,
        }, { status: 403 });
      }
    }

    // Code + nom : soit fournis, soit auto-generes.
    const code = d.code?.trim() || await nextRegisterCode(d.store_id);
    const name = d.name?.trim() || `Caisse ${code.replace(/\D/g, '')}`;

    const ins = await query<{ id: string; code: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name, is_active)
       VALUES ($1, $2, $3, $4, TRUE) RETURNING id, code`,
      [g.user.organizationId, d.store_id, code, name],
    );
    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'registers.create', entityType: 'register', entityId: ins.rows[0]!.id,
      payload: { ...d, code: ins.rows[0]!.code },
    });
    return NextResponse.json({ id: ins.rows[0]!.id, code: ins.rows[0]!.code }, { status: 201 });
  } catch (err) {
    const m = (err as Error).message ?? '';
    if (m.includes('duplicate')) return jsonError('CODE_ALREADY_EXISTS', 409);
    console.error('[registers.create]', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: m }, { status: 500 });
  }
}
