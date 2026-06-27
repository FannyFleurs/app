import { NextResponse } from 'next/server';
import net from 'node:net';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  ip: z.string().min(1).max(64),
  port: z.number().int().min(1).max(65535),
});

/**
 * Test de joignabilité TCP de l'imprimante.
 *
 * Limite : sur Vercel serverless, on est dans AWS — on ne peut pas
 * joindre une IP du LAN du commerçant (192.168.x, 10.x…) depuis là.
 * Le test est utile uniquement si l'imprimante a une IP publique ou
 * est exposée via un tunnel — sinon le test échouera mais l'impression
 * via AirPrint depuis l'iPad reste possible (autre canal).
 */
export async function POST(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { ip, port } = parsed.data;

  const result = await new Promise<{ ok: boolean; error?: string; ms?: number }>((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ ok: false, error: 'TIMEOUT' });
    }, 3000);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve({ ok: true, ms: Date.now() - start });
    });
    socket.once('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });
    try {
      socket.connect(port, ip);
    } catch (err) {
      clearTimeout(timer);
      resolve({ ok: false, error: (err as Error).message });
    }
  });

  return NextResponse.json(result);
}
