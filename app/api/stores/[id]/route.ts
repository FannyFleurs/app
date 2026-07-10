import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

const patch = z.object({
  code: z.string().min(1).max(40).optional(),
  name: z.string().min(1).max(120).optional(),
  address: z.object({
    line1: z.string().max(160).optional(),
    zip: z.string().max(20).optional(),
    city: z.string().max(120).optional(),
    country: z.string().max(80).optional(),
  }).optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, patch);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (d.code !== undefined)      { sets.push(`code = $${i++}`);    vals.push(d.code); }
  if (d.name !== undefined)      { sets.push(`name = $${i++}`);    vals.push(d.name); }
  if (d.address !== undefined)   { sets.push(`address = $${i++}`); vals.push(JSON.stringify(d.address)); }
  if (d.is_active !== undefined) { sets.push(`is_active = $${i++}`); vals.push(d.is_active); }
  if (sets.length === 0) return NextResponse.json({ ok: true });
  vals.push(params.id, g.user.organizationId);

  const r = await query(
    `UPDATE stores SET ${sets.join(', ')}
      WHERE id = $${i++} AND organization_id = $${i}`,
    vals,
  );
  if (r.rowCount === 0) return jsonError('NOT_FOUND', 404);

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'stores.update', entityType: 'store', entityId: params.id,
    payload: d,
  });
  return NextResponse.json({ ok: true });
}

/**
 * Suppression d'une boutique. Refusée si elle a des ventes validées
 * (données fiscales à conserver) ou si c'est la dernière boutique de
 * l'organisation. Supprime en cascade ses caisses (registers).
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;

  // La boutique appartient bien à l'org ?
  const own = await query(
    `SELECT 1 FROM stores WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (own.rowCount === 0) return jsonError('NOT_FOUND', 404);

  // Ne pas supprimer la dernière boutique.
  const total = await query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM stores WHERE organization_id = $1`,
    [g.user.organizationId],
  );
  if (Number(total.rows[0]?.c ?? 0) <= 1) {
    return NextResponse.json({
      error: 'LAST_STORE',
      message: 'Impossible de supprimer la dernière boutique de l\'organisation.',
    }, { status: 409 });
  }

  // Bloque si des ventes validées existent (conservation fiscale).
  try {
    const sales = await query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM sales
        WHERE store_id = $1 AND status = 'validated'`,
      [params.id],
    );
    if (Number(sales.rows[0]?.c ?? 0) > 0) {
      return NextResponse.json({
        error: 'STORE_HAS_SALES',
        message: 'Cette boutique a des ventes enregistrées : elle ne peut pas être supprimée (conservation fiscale). Vous pouvez la désactiver à la place.',
      }, { status: 409 });
    }
  } catch { /* table sales absente : on continue */ }

  try {
    // Nettoie les dépendances non fiscales avant suppression : caisses du
    // poste, droits d'accès boutique, et retire la boutique des produits
    // multi-boutiques. (Aucune vente validée à ce stade — vérifié plus haut.)
    await query(`DELETE FROM registers WHERE store_id = $1`, [params.id]);
    try { await query(`DELETE FROM user_store_access WHERE store_id = $1`, [params.id]); } catch { /* table absente */ }
    try {
      await query(
        `UPDATE products SET store_ids = array_remove(store_ids, $1)
          WHERE organization_id = $2 AND $1 = ANY(store_ids)`,
        [params.id, g.user.organizationId],
      );
    } catch { /* colonne store_ids absente ou type différent : on ignore */ }
    await query(`DELETE FROM stores WHERE id = $1 AND organization_id = $2`,
      [params.id, g.user.organizationId]);
  } catch (err) {
    const m = (err as Error).message ?? '';
    // Contrainte FK (données rattachées) : on refuse proprement.
    return NextResponse.json({
      error: 'STORE_IN_USE',
      message: 'Impossible de supprimer : des données sont rattachées à cette boutique. Désactivez-la à la place.',
      detail: m,
    }, { status: 409 });
  }

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'stores.delete', entityType: 'store', entityId: params.id,
    payload: {},
  });
  return NextResponse.json({ ok: true });
}
