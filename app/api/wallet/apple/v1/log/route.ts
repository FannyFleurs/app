import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * PassKit Web Service — Apple pousse ses erreurs ici.
 * Corps : { logs: string[] }. On log en console pour debug ;
 * pas de reponse metier attendue par Apple.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json() as { logs?: string[] };
    if (Array.isArray(body?.logs)) {
      for (const l of body.logs) {
        // eslint-disable-next-line no-console
        console.warn('[wallet.apple.log]', l);
      }
    }
  } catch { /* ignore */ }
  return new NextResponse(null, { status: 200 });
}
