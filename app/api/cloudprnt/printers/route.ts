import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { query } from '@/lib/db/client';
import { storeInOrg } from '@/lib/auth/stores-server';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  mac: z.string().min(4).max(64),
  label: z.string().min(1).max(80),
  store_id: z.string().uuid().nullable().optional(),
  role: z.enum(['label', 'receipt']).optional(),
  poll_token: z.string().max(120).nullable().optional(),
  poll_interval: z.number().int().min(1).max(60).optional(),
});

export async function GET(req: Request) {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;
  // Filtre optionnel par rôle : ?role=label (étiquettes) ou ?role=receipt (ticket).
  const roleParam = new URL(req.url).searchParams.get('role');
  const role = roleParam === 'label' || roleParam === 'receipt' ? roleParam : null;
  const { rows } = await query(
    `SELECT p.id, p.mac, p.label, p.store_id, p.role, p.poll_token, p.poll_interval,
            p.enabled, p.last_seen_at, p.last_status,
            s.name AS store_name,
            (SELECT COUNT(*) FROM cloudprnt_jobs j
              WHERE j.printer_id = p.id AND j.status = 'queued')::int AS queued
       FROM cloudprnt_printers p
       LEFT JOIN stores s ON s.id = p.store_id
      WHERE p.organization_id = $1
        AND ($2::text IS NULL OR p.role = $2)
      ORDER BY p.created_at`,
    [g.user.organizationId, role],
  );
  return NextResponse.json({ printers: rows });
}

export async function POST(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, createSchema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;
  if (d.store_id && !(await storeInOrg(d.store_id, g.user.organizationId))) {
    return NextResponse.json({ error: 'STORE_NOT_FOUND' }, { status: 400 });
  }
  try {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO cloudprnt_printers
         (organization_id, store_id, mac, label, role, poll_token, poll_interval)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [g.user.organizationId, d.store_id ?? null, d.mac.trim(), d.label.trim(),
       d.role ?? 'label', d.poll_token?.trim() || null, d.poll_interval ?? 5],
    );
    return NextResponse.json({ id: rows[0]!.id }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'MAC_ALREADY_REGISTERED' }, { status: 409 });
    }
    throw e;
  }
}
