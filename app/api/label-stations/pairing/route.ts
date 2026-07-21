import { NextResponse } from 'next/server';
import { z } from 'zod';
import QRCode from 'qrcode';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { generatePairingCode, getPairingCode } from '@/lib/services/pda-pairing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function qrFor(code: string): Promise<string> {
  try { return await QRCode.toDataURL(code, { margin: 1, width: 240 }); }
  catch { return ''; }
}

/** GET /api/label-stations/pairing?store_id=... — code courant + QR (BO). */
export async function GET(req: Request) {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;
  const storeId = new URL(req.url).searchParams.get('store_id');
  if (!storeId) return jsonError('STORE_REQUIRED', 400);
  const code = await getPairingCode(g.user.organizationId, storeId);
  return NextResponse.json({ code, qr: code ? await qrFor(code) : null });
}

const schema = z.object({ store_id: z.string().uuid() });

/** POST /api/label-stations/pairing — (re)génère le code d'appairage (BO). */
export async function POST(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  const store = await query<{ name: string }>(
    `SELECT name FROM stores WHERE id = $1 AND organization_id = $2`,
    [parsed.data.store_id, g.user.organizationId],
  );
  if (store.rowCount === 0) return jsonError('STORE_NOT_FOUND', 404);

  const code = await generatePairingCode(
    g.user.organizationId, parsed.data.store_id, store.rows[0]!.name, g.user.id,
  );
  return NextResponse.json({ code, qr: await qrFor(code) });
}
