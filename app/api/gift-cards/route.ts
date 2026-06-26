import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { GiftCardService } from '@/lib/services/gift-card-service';
import { audit } from '@/lib/audit/log';
import { query } from '@/lib/db/client';

const createSchema = z.object({
  amount: z.number().positive(),
  expires_at: z.string().optional().nullable(),
  buyer_id: z.string().uuid().optional().nullable(),
  buyer_name: z.string().max(160).optional(),
  buyer_phone: z.string().max(40).optional(),
  buyer_email: z.string().max(160).optional(),
  beneficiary_id: z.string().uuid().optional().nullable(),
});

export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  const q = url.searchParams.get('q');
  if (q) {
    const rows = await GiftCardService.search(g.user.organizationId, q, 50);
    return NextResponse.json({ gift_cards: rows });
  }
  // Détection runtime des colonnes optionnelles ajoutées par migrations.
  const colsRes = await query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'gift_cards'`,
  );
  const cols = new Set(colsRes.rows.map((r) => r.column_name));
  const has = (c: string) => cols.has(c);

  // SELECT défensif : on n'utilise que les colonnes qui existent vraiment.
  const buyerCols = has('buyer_name')
    ? `buyer_name, buyer_phone, buyer_email`
    : `NULL AS buyer_name, NULL AS buyer_phone, NULL AS buyer_email`;
  const benefCol = has('beneficiary_id') ? `beneficiary_id` : `NULL AS beneficiary_id`;

  let rows: Array<Record<string, unknown>> = [];
  try {
    const r = await query<Record<string, unknown>>(
      `SELECT id, code, initial_amount::text, balance::text, status,
              issued_at, expires_at,
              ${buyerCols},
              ${benefCol}
         FROM gift_cards
        WHERE organization_id = $1
        ORDER BY issued_at DESC
        LIMIT 200`,
      [g.user.organizationId],
    );
    rows = r.rows;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[gift_cards.list] SELECT échoué :', err);
    return NextResponse.json({ gift_cards: [], error: (err as Error).message }, { status: 200 });
  }

  // Enrichissement bénéficiaire : on récupère les clients liés dans une
  // 2e requête (plus robuste qu'un JOIN qui dépend du schéma).
  const beneficiaryIds = Array.from(
    new Set(rows.map((r) => r.beneficiary_id).filter(Boolean) as string[]),
  );
  if (beneficiaryIds.length > 0) {
    try {
      const custs = await query<{
        id: string; first_name: string | null; last_name: string | null;
        company_name: string | null; phone: string | null;
      }>(
        `SELECT id, first_name, last_name, company_name, phone
           FROM customers
          WHERE id = ANY($1::uuid[])`,
        [beneficiaryIds],
      );
      const byId = new Map(custs.rows.map((c) => [c.id, c]));
      rows = rows.map((r) => {
        const c = r.beneficiary_id ? byId.get(r.beneficiary_id as string) : undefined;
        if (!c) return r;
        const name = c.company_name
          || [c.first_name, c.last_name].filter(Boolean).join(' ').trim()
          || null;
        return { ...r, beneficiary_name: name, beneficiary_phone: c.phone };
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[gift_cards.list] enrichissement clients échoué :', err);
    }
  }

  return NextResponse.json({ gift_cards: rows });
}

export async function POST(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, createSchema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;
  try {
    const out = await GiftCardService.create({
      organizationId: g.user.organizationId,
      userId: g.user.id,
      amount: d.amount,
      expiresAt: d.expires_at,
      buyer: {
        id: d.buyer_id,
        name: d.buyer_name,
        phone: d.buyer_phone,
        email: d.buyer_email,
      },
      beneficiaryId: d.beneficiary_id,
    });
    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'gift_cards.create', entityType: 'gift_card', entityId: out.id,
      payload: { amount: d.amount, code: out.code },
    });
    return NextResponse.json(out, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[gift_cards.create]', err);
    const m = (err as Error).message ?? '';
    const hint = m.includes('buyer_name') || m.includes('column')
      ? 'Migration manquante : exécutez `npm run db:migrate` (0006_gift_card_buyer.sql).'
      : m;
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: hint }, { status: 500 });
  }
}
