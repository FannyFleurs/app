import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { normalizeMac, type CloudPrntPrinter } from '@/lib/services/cloudprnt/queue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Endpoint Star CloudPRNT (public : appelé par l'imprimante, sans session).
 * L'imprimante est configurée avec cette URL + un jeton optionnel (?t=...).
 *
 *   POST   → sondage : « as-tu un job pour moi ? »   → { jobReady, mediaTypes, jobToken }
 *   GET     → récupère le contenu du job              → corps binaire + Content-Type
 *   DELETE  → confirme l'impression                   → 200
 *
 * L'imprimante est identifiée par son adresse MAC (corps JSON au POST,
 * paramètre ?mac= au GET/DELETE).
 */

async function findPrinter(mac: string, token: string | null): Promise<CloudPrntPrinter | null> {
  const norm = normalizeMac(mac);
  if (!norm) return null;
  const { rows } = await query<CloudPrntPrinter>(
    `SELECT id, organization_id, store_id, mac, label, role, poll_token, enabled
       FROM cloudprnt_printers
      WHERE regexp_replace(lower(mac), '[^0-9a-f]', '', 'g') = $1
      LIMIT 1`,
    [norm],
  );
  const p = rows[0];
  if (!p || !p.enabled) return null;
  // Jeton optionnel : s'il est configuré, il doit correspondre.
  if (p.poll_token && p.poll_token !== token) return null;
  return p;
}

// --- POST : sondage -------------------------------------------------------
export async function POST(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('t');
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const mac = String(body.printerMAC ?? body.mac ?? url.searchParams.get('mac') ?? '');
  const printer = await findPrinter(mac, token);
  if (!printer) return NextResponse.json({ jobReady: false });

  // Trace l'état remonté par l'imprimante.
  await query(
    `UPDATE cloudprnt_printers
        SET last_seen_at = now(), last_status = $2, updated_at = now()
      WHERE id = $1`,
    [printer.id, String(body.statusCode ?? body.status ?? '').slice(0, 200) || null],
  ).catch(() => undefined);

  const { rows } = await query<{ token: string; content_type: string }>(
    `SELECT token, content_type FROM cloudprnt_jobs
      WHERE printer_id = $1 AND status = 'queued'
      ORDER BY created_at ASC LIMIT 1`,
    [printer.id],
  );
  const job = rows[0];
  if (!job) return NextResponse.json({ jobReady: false });
  return NextResponse.json({
    jobReady: true,
    mediaTypes: [job.content_type],
    jobToken: job.token,
  });
}

// --- GET : récupère le job ------------------------------------------------
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('t');
  const mac = url.searchParams.get('mac') ?? '';
  const jobToken = url.searchParams.get('token');
  const printer = await findPrinter(mac, token);
  if (!printer) return new NextResponse(null, { status: 404 });

  const { rows } = await query<{ id: string; content_type: string; payload: Buffer }>(
    jobToken
      ? `SELECT id, content_type, payload FROM cloudprnt_jobs
           WHERE printer_id = $1 AND token = $2 LIMIT 1`
      : `SELECT id, content_type, payload FROM cloudprnt_jobs
           WHERE printer_id = $1 AND status = 'queued'
           ORDER BY created_at ASC LIMIT 1`,
    jobToken ? [printer.id, jobToken] : [printer.id],
  );
  const job = rows[0];
  if (!job) return new NextResponse(null, { status: 404 });

  await query(
    `UPDATE cloudprnt_jobs
        SET status = 'printing', attempts = attempts + 1, updated_at = now()
      WHERE id = $1`,
    [job.id],
  ).catch(() => undefined);

  const buf = Buffer.isBuffer(job.payload) ? job.payload : Buffer.from(job.payload as unknown as string);
  return new NextResponse(buf, {
    status: 200,
    headers: { 'Content-Type': job.content_type, 'Content-Length': String(buf.length) },
  });
}

// --- DELETE : confirme l'impression ---------------------------------------
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('t');
  const mac = url.searchParams.get('mac') ?? '';
  const jobToken = url.searchParams.get('token');
  const code = url.searchParams.get('code') ?? '';
  const printer = await findPrinter(mac, token);
  if (!printer) return new NextResponse(null, { status: 404 });
  if (!jobToken) return new NextResponse(null, { status: 400 });

  // code « 2xx » / « OK » = succès ; sinon on marque en erreur.
  const ok = /^2\d\d/.test(code) || /ok/i.test(code) || code === '';
  await query(
    `UPDATE cloudprnt_jobs
        SET status = $2,
            printed_at = CASE WHEN $2 = 'done' THEN now() ELSE printed_at END,
            updated_at = now()
      WHERE printer_id = $1 AND token = $3`,
    [printer.id, ok ? 'done' : 'error', jobToken],
  ).catch(() => undefined);
  return new NextResponse(null, { status: 200 });
}
