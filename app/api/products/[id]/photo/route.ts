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

const DATA_URL = /^data:([^;,]+)(;base64)?,([\s\S]*)$/;

/**
 * GET /api/products/[id]/photo
 * Sert la photo (décodée depuis la data URL stockée) avec un cache long —
 * la caisse référence cette route plutôt que d'embarquer la donnée dans
 * chaque réponse de catalogue (voir lib/products/photo-url.ts : évite de
 * retransférer la même photo à chaque poll, pour chaque poste ouvert).
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('products.read');
  if ('response' in g) return g.response;

  const res = await query<{ image_url: string | null }>(
    `SELECT image_url FROM products WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  const imageUrl = res.rows[0]?.image_url;
  if (!imageUrl) return jsonError('NOT_FOUND', 404);

  const m = DATA_URL.exec(imageUrl);
  if (!m) return jsonError('NOT_FOUND', 404);
  const [, mime, isBase64, payload] = m;
  const buffer = isBase64 ? Buffer.from(payload!, 'base64') : Buffer.from(decodeURIComponent(payload!), 'utf8');

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': mime || 'application/octet-stream',
      // Immuable : l'URL est versionnée par updated_at (?v=...), une photo
      // modifiée produit une URL différente — jamais de cache périmé.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

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
