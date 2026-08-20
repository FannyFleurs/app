import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { query } from '@/lib/db/client';
import { SUPPORT_REQUEST_COOKIE } from '@/lib/support-access/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** État de dépannage de la session courante (pour le bandeau). */
export async function GET() {
  const rid = cookies().get(SUPPORT_REQUEST_COOKIE)?.value;
  if (!rid) return NextResponse.json({ impersonating: false });
  try {
    const r = await query<{ status: string; access_expires_at: string | null; org_name: string }>(
      `SELECT sar.status, sar.access_expires_at, o.name AS org_name
         FROM support_access_requests sar
         JOIN organizations o ON o.id = sar.organization_id
        WHERE sar.id = $1`,
      [rid],
    );
    const row = r.rows[0];
    if (!row || row.status !== 'approved') return NextResponse.json({ impersonating: false });
    return NextResponse.json({
      impersonating: true,
      org_name: row.org_name,
      access_expires_at: row.access_expires_at,
    });
  } catch {
    return NextResponse.json({ impersonating: false });
  }
}
