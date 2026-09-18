import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query, withTransaction } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { hasTargetsTable } from '@/lib/analytics/targets-server';

export const dynamic = 'force-dynamic';

const periodSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

/**
 * Objectifs de CA du mois (année, mois) : une entrée par boutique active, avec
 * l'objectif défini (0 si aucun). Sert à la page de saisie / suivi.
 */
export async function GET(req: Request) {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;

  const url = new URL(req.url);
  const parsed = periodSchema.safeParse({
    year: url.searchParams.get('year'),
    month: url.searchParams.get('month'),
  });
  if (!parsed.success) return jsonError('INVALID_PARAMS', 400);
  const { year, month } = parsed.data;

  const hasTable = await hasTargetsTable();
  const { rows } = await query<{ store_id: string; store: string; target: string | null }>(
    `SELECT st.id AS store_id, st.name AS store,
            ${hasTable ? 'rt.target_ttc::text' : 'NULL'} AS target
       FROM stores st
       ${hasTable ? `LEFT JOIN revenue_targets rt
              ON rt.store_id = st.id AND rt.organization_id = $1
             AND rt.year = $2 AND rt.month = $3` : ''}
      WHERE st.organization_id = $1 AND st.is_active = TRUE
      ORDER BY st.name`,
    hasTable ? [g.user.organizationId, year, month] : [g.user.organizationId],
  );

  return NextResponse.json({
    year, month,
    stores: rows.map((r) => ({
      store_id: r.store_id, store: r.store, target: r.target != null ? Number(r.target) : 0,
    })),
  });
}

const putSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  targets: z.record(z.string().uuid(), z.number().min(0).max(1e12)),
});

/** Enregistre (upsert) les objectifs d'un mois pour une ou plusieurs boutiques. */
export async function PUT(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  if (!(await hasTargetsTable())) return jsonError('NOT_MIGRATED', 503);

  const parsed = await parseJson(req, putSchema);
  if ('response' in parsed) return parsed.response;
  const { year, month, targets } = parsed.data;

  const entries = Object.entries(targets);
  if (entries.length > 0) {
    // Sécurité : les boutiques ciblées appartiennent bien à l'organisation.
    const own = await query<{ id: string }>(
      `SELECT id FROM stores WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
      [g.user.organizationId, entries.map(([id]) => id)],
    );
    const allowed = new Set(own.rows.map((r) => r.id));

    await withTransaction(async (client) => {
      for (const [storeId, amount] of entries) {
        if (!allowed.has(storeId)) continue;
        await client.query(
          `INSERT INTO revenue_targets (organization_id, store_id, year, month, target_ttc, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (organization_id, store_id, year, month) DO UPDATE
             SET target_ttc = EXCLUDED.target_ttc, updated_at = now(), updated_by = EXCLUDED.updated_by`,
          [g.user.organizationId, storeId, year, month, amount, g.user.id],
        );
      }
    });
  }

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'revenue_targets.set', entityType: 'revenue_targets', entityId: null,
    payload: { year, month, count: entries.length },
  });

  return NextResponse.json({ ok: true });
}
