import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

/**
 * Réceptions — liste complète (Paramètres → Réceptions), import ou
 * création manuelle confondus. Pour la liste PDA (uniquement celles
 * envoyées, avec des articles restants), voir /api/pda/receptions.
 */
export async function GET() {
  const g = await requirePermission('stock.adjust');
  if ('response' in g) return g.response;

  const { rows } = await query<{
    id: string; filename: string | null; store_ids: string[]; sent_to_pda: boolean;
    created_at: string; total: string; received: string;
  }>(
    `SELECT r.id, r.filename, r.store_ids, r.sent_to_pda, r.created_at::text,
            COUNT(ri.id)::text AS total,
            COUNT(ri.id) FILTER (WHERE ri.received_qty IS NOT NULL)::text AS received
       FROM receptions r
       LEFT JOIN reception_items ri ON ri.reception_id = r.id
      WHERE r.organization_id = $1
      GROUP BY r.id
      ORDER BY r.created_at DESC
      LIMIT 200`,
    [g.user.organizationId],
  );

  return NextResponse.json({
    receptions: rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      store_ids: r.store_ids,
      sent_to_pda: r.sent_to_pda,
      created_at: r.created_at,
      total: Number(r.total),
      received: Number(r.received),
      started: Number(r.received) > 0,
    })),
  });
}

const createSchema = z.object({
  store_ids: z.array(z.string().uuid()).optional(),
  product_ids: z.array(z.string().uuid()).min(1).max(5000),
});

/**
 * Création manuelle d'une réception : sélection de références EXISTANTES
 * (pas de création d'article ici — voir Produits → Importer pour ça).
 * Envoyée au PDA immédiatement (pas de bascule séparée : contrairement à
 * un import, créer une réception manuelle n'a de sens QUE pour la
 * réceptionner sur le PDA).
 */
export async function POST(req: Request) {
  const g = await requirePermission('products.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, createSchema);
  if ('response' in parsed) return parsed.response;
  const storeIds = parsed.data.store_ids ?? [];

  const owned = await query<{ id: string }>(
    `SELECT id FROM products WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
    [g.user.organizationId, parsed.data.product_ids],
  );
  const ownedIds = new Set(owned.rows.map((r) => r.id));
  const productIds = parsed.data.product_ids.filter((id) => ownedIds.has(id));
  if (productIds.length === 0) return jsonError('NO_VALID_PRODUCTS', 422);

  const reception = await query<{ id: string; created_at: string }>(
    `INSERT INTO receptions (organization_id, filename, store_ids, sent_to_pda, product_count, created_by)
     VALUES ($1, NULL, $2, TRUE, $3, $4) RETURNING id, created_at::text`,
    [g.user.organizationId, storeIds, productIds.length, g.user.id],
  );
  const receptionId = reception.rows[0]!.id;

  const values: string[] = [];
  const params: unknown[] = [];
  productIds.forEach((pid, i) => {
    values.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
    params.push(receptionId, pid);
  });
  await query(
    `INSERT INTO reception_items (reception_id, product_id) VALUES ${values.join(',')}`,
    params,
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'receptions.create', entityType: 'reception', entityId: receptionId,
    payload: { product_count: productIds.length, store_ids: storeIds },
  });

  return NextResponse.json({ id: receptionId, created_at: reception.rows[0]!.created_at }, { status: 201 });
}
