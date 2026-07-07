import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

/**
 * PassKit Web Service — register / unregister a device.
 * Spec :
 *   POST   /v1/devices/{device}/registrations/{passType}/{serial}
 *   DELETE idem
 *   Auth  : Authorization: ApplePass <authenticationToken du pass>
 */

interface Params {
  deviceId: string;
  passTypeId: string;
  serial: string;
}

async function findPass(passTypeId: string, serial: string) {
  const r = await query<{ id: string; authentication_token: string; organization_id: string }>(
    `SELECT id, authentication_token, organization_id
       FROM wallet_passes
      WHERE provider='apple' AND pass_type_id = $1 AND serial_number = $2`,
    [passTypeId, serial],
  );
  return r.rows[0] ?? null;
}

function extractAuthToken(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  const m = h.match(/^ApplePass\s+(.+)$/i);
  return m ? m[1]!.trim() : null;
}

export async function POST(req: Request, { params }: { params: Params }) {
  const pass = await findPass(params.passTypeId, params.serial);
  if (!pass) return new NextResponse(null, { status: 404 });
  if (extractAuthToken(req) !== pass.authentication_token) {
    return new NextResponse(null, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as { pushToken?: string }));
  const pushToken = body.pushToken;
  if (!pushToken || typeof pushToken !== 'string') {
    return new NextResponse(null, { status: 400 });
  }

  // ON CONFLICT : deja enregistre → 200, sinon 201.
  const existing = await query(
    `SELECT id FROM wallet_devices
      WHERE pass_id = $1 AND device_library_id = $2`,
    [pass.id, params.deviceId],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    return new NextResponse(null, { status: 200 });
  }
  await query(
    `INSERT INTO wallet_devices (pass_id, device_library_id, push_token)
     VALUES ($1, $2, $3)
     ON CONFLICT (pass_id, device_library_id) DO UPDATE SET push_token = EXCLUDED.push_token`,
    [pass.id, params.deviceId, pushToken],
  );
  return new NextResponse(null, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Params }) {
  const pass = await findPass(params.passTypeId, params.serial);
  if (!pass) return new NextResponse(null, { status: 404 });
  if (extractAuthToken(req) !== pass.authentication_token) {
    return new NextResponse(null, { status: 401 });
  }
  await query(
    `DELETE FROM wallet_devices
      WHERE pass_id = $1 AND device_library_id = $2`,
    [pass.id, params.deviceId],
  );
  return new NextResponse(null, { status: 200 });
}
