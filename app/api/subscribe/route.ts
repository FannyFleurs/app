import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { parseJson, jsonError } from '@/lib/validation/api';

// Accès Postgres : runtime Node, jamais Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().trim().email('email invalide').max(180),
  // Piège anti-robot : champ masqué qui doit rester vide.
  company: z.string().optional(),
});

/**
 * Inscription à la liste email depuis le site vitrine. Public, sans compte.
 * Enregistre l'adresse (idempotent) et renvoie un JSON simple pour le
 * formulaire. Aucune pression : simple opt-in aux nouveautés.
 */
export async function POST(req: Request) {
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { email, company } = parsed.data;

  // Honeypot rempli : on répond OK sans rien enregistrer.
  if (company && company.length > 0) return NextResponse.json({ ok: true });

  try {
    await query(
      `INSERT INTO email_subscribers (email, source)
       VALUES ($1, 'site')
       ON CONFLICT (email) DO NOTHING`,
      [email.toLowerCase()],
    );
    return NextResponse.json({ ok: true });
  } catch {
    return jsonError('SERVER_ERROR', 500);
  }
}
