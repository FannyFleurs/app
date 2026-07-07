import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

/**
 * PassKit Web Service — list serials updated since a tag.
 *   GET /v1/devices/{device}/registrations/{passType}?passesUpdatedSince={tag}
 *
 * Reponse : { lastUpdated, serialNumbers[] } ou 204 si rien de neuf.
 * Le tag est un timestamp ISO — Apple le renvoie tel quel a la
 * prochaine requete.
 */

interface Params { deviceId: string; passTypeId: string }

export async function GET(req: Request, { params }: { params: Params }) {
  const url = new URL(req.url);
  const since = url.searchParams.get('passesUpdatedSince');
  const sinceDate = since ? new Date(since) : new Date(0);
  if (isNaN(sinceDate.getTime())) {
    return new NextResponse(null, { status: 400 });
  }

  const rows = await query<{ serial_number: string; updated_at: string }>(
    `SELECT wp.serial_number, wp.updated_at
       FROM wallet_passes wp
       JOIN wallet_devices wd ON wd.pass_id = wp.id
      WHERE wp.provider = 'apple'
        AND wp.pass_type_id = $1
        AND wd.device_library_id = $2
        AND wp.updated_at > $3
      ORDER BY wp.updated_at DESC`,
    [params.passTypeId, params.deviceId, sinceDate.toISOString()],
  );
  if (rows.rowCount === 0) {
    return new NextResponse(null, { status: 204 });
  }
  const lastUpdated = rows.rows[0]!.updated_at;
  return NextResponse.json({
    lastUpdated: new Date(lastUpdated).toISOString(),
    serialNumbers: rows.rows.map((r) => r.serial_number),
  });
}
