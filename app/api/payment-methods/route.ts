import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';

const KINDS = ['cash','card','check','transfer','gift_card','credit_note','payment_link','deferred','other'] as const;

const schema = z.object({
  code: z.string().max(40).optional(),
  kind: z.enum(KINDS),
  label: z.string().min(1).max(80),
  position: z.number().int().min(0).optional(),
  store_ids: z.array(z.string().uuid()).optional(),
});

// Introspection mise en cache : la colonne store_ids (migration 0044) est-elle
// présente ? Permet un fail-open tant que la migration n'est pas déployée.
let _hasStoreIds: boolean | null = null;
async function hasStoreIdsColumn(): Promise<boolean> {
  if (_hasStoreIds !== null) return _hasStoreIds;
  try {
    const { rows } = await query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_name = 'payment_methods' AND column_name = 'store_ids'
       ) AS exists`,
    );
    _hasStoreIds = rows[0]?.exists ?? false;
  } catch { _hasStoreIds = false; }
  return _hasStoreIds;
}

const DEFAULT_METHODS: Array<{ kind: typeof KINDS[number]; label: string; position: number }> = [
  { kind: 'cash',         label: 'Espèces',              position: 10 },
  { kind: 'card',         label: 'Carte bancaire',       position: 20 },
  { kind: 'check',        label: 'Chèque',               position: 30 },
  { kind: 'transfer',     label: 'Virement',             position: 40 },
  { kind: 'gift_card',    label: 'Carte cadeau',         position: 50 },
  { kind: 'credit_note',  label: 'Avoir',                position: 60 },
  { kind: 'payment_link', label: 'Lien de paiement Stripe', position: 70 },
];

export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const storeId = new URL(req.url).searchParams.get('store_id') || undefined;
  const hasStoreIds = await hasStoreIdsColumn();

  const storeIdsCol = hasStoreIds ? 'store_ids' : `'{}'::uuid[] AS store_ids`;
  // Filtre boutique (caisse) : un mode limité à certaines boutiques
  // (store_ids non vide) n'apparaît que pour ces boutiques ; vide = toutes.
  const params: unknown[] = [g.user.organizationId];
  let where = 'organization_id = $1';
  if (storeId && hasStoreIds) {
    params.push(storeId);
    where += ` AND (COALESCE(array_length(store_ids, 1), 0) = 0 OR store_ids @> ARRAY[$${params.length}]::uuid[])`;
  }
  const sql = `SELECT id, code, kind, label, is_active, position, ${storeIdsCol}
                 FROM payment_methods WHERE ${where}
                ORDER BY position, label`;

  // Auto-seed : si l'organisation n'a aucun mode de reglement, on cree
  // les modes par defaut (portee "toutes boutiques").
  let { rows } = await query<{ id: string; code: string; kind: string; label: string; is_active: boolean; position: number; store_ids: string[] }>(sql, params);
  if (rows.length === 0) {
    for (const m of DEFAULT_METHODS) {
      const code = `${m.kind}_default`;
      try {
        await query(
          `INSERT INTO payment_methods (organization_id, code, kind, label, position)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING`,
          [g.user.organizationId, code, m.kind, m.label, m.position],
        );
      } catch { /* on n'echoue jamais la lecture pour un probleme de seed */ }
    }
    rows = (await query<{ id: string; code: string; kind: string; label: string; is_active: boolean; position: number; store_ids: string[] }>(sql, params)).rows;
  }
  return NextResponse.json({ methods: rows });
}

export async function POST(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const m = parsed.data;
  const code = m.code ?? `${m.kind}_${Date.now().toString(36)}`;
  try {
    const withStoreIds = (m.store_ids !== undefined) && (await hasStoreIdsColumn());
    const ins = withStoreIds
      ? await query<{ id: string }>(
          `INSERT INTO payment_methods (organization_id, code, kind, label, position, store_ids)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [g.user.organizationId, code, m.kind, m.label, m.position ?? 99, m.store_ids],
        )
      : await query<{ id: string }>(
          `INSERT INTO payment_methods (organization_id, code, kind, label, position)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [g.user.organizationId, code, m.kind, m.label, m.position ?? 99],
        );
    return NextResponse.json({ id: ins.rows[0]!.id }, { status: 201 });
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (msg.includes('duplicate') || msg.includes('unique')) {
      return NextResponse.json(
        { error: 'CODE_ALREADY_EXISTS', message: 'Un mode avec ce code existe deja.' },
        { status: 409 },
      );
    }
    if (msg.includes('check') || msg.includes('kind')) {
      return NextResponse.json(
        {
          error: 'INVALID_KIND',
          message: 'Ce type de reglement n\'est pas encore accepte par la base. Deployez la migration 0027.',
        },
        { status: 400 },
      );
    }
    console.error('[payment-methods.create]', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: msg }, { status: 500 });
  }
}
