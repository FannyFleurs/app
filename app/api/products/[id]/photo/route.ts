import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

// image_url (colonne TEXT) accepte une data URL : la photo est compressée
// côté client avant envoi. On plafonne à ~1,5 Mo pour éviter d'énormes lignes.
const schema = z.object({
  image_url: z.string().max(1_500_000),
});

/**
 * PATCH /api/products/[id]/photo
 * Enregistre la photo (data URL compressée) prise depuis le PDA sur l'article.
 * Sert de vignette en caisse et de visuel dans le back-office.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('products.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  const res = await query(
    `UPDATE products SET image_url = $1, updated_at = now(), updated_by = $2
      WHERE id = $3 AND organization_id = $4`,
    [parsed.data.image_url || null, g.user.id, params.id, g.user.organizationId],
  );
  if (res.rowCount === 0) return jsonError('NOT_FOUND', 404);

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'products.photo', entityType: 'product', entityId: params.id,
  });
  return NextResponse.json({ ok: true });
}
