import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withTransaction } from '@/lib/db/client';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('extend_trial'),
    days: z.number().int().min(1).max(365),
    reason: z.string().max(200).optional(),
  }),
  z.object({
    action: z.literal('change_plan'),
    plan: z.enum(['trial', 'starter', 'pro', 'enterprise', 'cancelled']),
    period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    reason: z.string().max(200).optional(),
  }),
  z.object({
    action: z.literal('grant_comp'),
    days: z.number().int().min(1).max(365),
    reason: z.string().max(200),
  }),
  z.object({
    action: z.literal('cancel'),
    immediate: z.boolean().optional(),
    reason: z.string().max(200).optional(),
  }),
  z.object({
    action: z.literal('reactivate'),
    reason: z.string().max(200).optional(),
  }),
  z.object({
    action: z.literal('note'),
    text: z.string().min(1).max(1000),
  }),
]);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requireSuperAdmin();
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  try {
    const result = await withTransaction(async (client) => {
      const exists = await client.query(`SELECT 1 FROM organizations WHERE id = $1`, [params.id]);
      if (exists.rowCount === 0) throw new Error('NOT_FOUND');

      // S'assure qu'une ligne subscriptions existe.
      await client.query(
        `INSERT INTO subscriptions (organization_id, plan, status, current_period_start, current_period_end)
         VALUES ($1, 'trial', 'active', now(), now() + interval '14 days')
         ON CONFLICT (organization_id) DO NOTHING`,
        [params.id],
      );

      let eventType: string = 'note';
      let payload: Record<string, unknown> = {};

      switch (d.action) {
        case 'extend_trial': {
          await client.query(
            `UPDATE organizations
               SET trial_ends_at = GREATEST(
                 COALESCE(trial_ends_at, now()),
                 now()
               ) + ($2 || ' days')::interval
             WHERE id = $1`,
            [params.id, String(d.days)],
          );
          await client.query(
            `UPDATE subscriptions
               SET current_period_end = GREATEST(
                 COALESCE(current_period_end, now()),
                 now()
               ) + ($2 || ' days')::interval,
                   updated_at = now()
             WHERE organization_id = $1`,
            [params.id, String(d.days)],
          );
          eventType = 'trial_extended';
          payload = { days: d.days, reason: d.reason ?? null };
          break;
        }
        case 'change_plan': {
          await client.query(
            `UPDATE organizations SET plan = $2 WHERE id = $1`,
            [params.id, d.plan],
          );
          await client.query(
            `UPDATE subscriptions
               SET plan = $2,
                   status = CASE WHEN $2 = 'cancelled' THEN 'cancelled' ELSE 'active' END,
                   current_period_end = COALESCE($3::date::timestamptz, current_period_end),
                   updated_at = now()
             WHERE organization_id = $1`,
            [params.id, d.plan, d.period_end ?? null],
          );
          eventType = 'plan_changed';
          payload = { plan: d.plan, period_end: d.period_end ?? null, reason: d.reason ?? null };
          break;
        }
        case 'grant_comp': {
          // Crédite des jours offerts en allongeant la période courante
          await client.query(
            `UPDATE subscriptions
               SET current_period_end = GREATEST(
                 COALESCE(current_period_end, now()),
                 now()
               ) + ($2 || ' days')::interval,
                   updated_at = now()
             WHERE organization_id = $1`,
            [params.id, String(d.days)],
          );
          eventType = 'comp_granted';
          payload = { days: d.days, reason: d.reason };
          break;
        }
        case 'cancel': {
          await client.query(
            `UPDATE subscriptions
               SET status = CASE WHEN $2 THEN 'cancelled' ELSE status END,
                   cancel_at_period_end = NOT $2,
                   updated_at = now()
             WHERE organization_id = $1`,
            [params.id, d.immediate ?? false],
          );
          if (d.immediate) {
            await client.query(
              `UPDATE organizations SET plan = 'cancelled' WHERE id = $1`,
              [params.id],
            );
          }
          eventType = 'subscription_cancelled';
          payload = { immediate: d.immediate ?? false, reason: d.reason ?? null };
          break;
        }
        case 'reactivate': {
          await client.query(
            `UPDATE subscriptions
               SET status = 'active', cancel_at_period_end = FALSE, updated_at = now()
             WHERE organization_id = $1`,
            [params.id],
          );
          eventType = 'reactivated';
          payload = { reason: d.reason ?? null };
          break;
        }
        case 'note': {
          eventType = 'note';
          payload = { text: d.text };
          break;
        }
      }

      await client.query(
        `INSERT INTO subscription_events
           (organization_id, event_type, payload, performed_by)
         VALUES ($1, $2, $3, $4)`,
        [params.id, eventType, JSON.stringify(payload), g.user.id],
      );

      return { ok: true };
    });
    return NextResponse.json(result);
  } catch (err) {
    const m = (err as Error).message;
    if (m === 'NOT_FOUND') return jsonError('NOT_FOUND', 404);
    // eslint-disable-next-line no-console
    console.error('[admin.subscription]', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: m }, { status: 500 });
  }
}
