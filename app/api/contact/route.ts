import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJson, jsonError } from '@/lib/validation/api';
import { saveAndNotifyContact } from '@/lib/site/contact';

// Envoi d'email (Brevo) + accès Postgres : runtime Node, jamais Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  name: z.string().trim().min(1, 'requis').max(120),
  shop: z.string().trim().max(160).optional().default(''),
  email: z.string().trim().email('email invalide').max(180),
  phone: z.string().trim().max(60).optional().default(''),
  message: z.string().trim().max(4000).optional().default(''),
  // Piège anti-robot : champ masqué qui doit rester vide (les bots le
  // remplissent). Accepté par le schéma, filtré silencieusement plus bas.
  company: z.string().optional(),
});

/**
 * Réception d'une demande de contact / démo depuis le site vitrine.
 * Public (aucune authentification) : enregistre la demande et notifie
 * l'équipe par email. Renvoie toujours un JSON simple pour le formulaire.
 */
export async function POST(req: Request) {
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  // Honeypot rempli : on répond OK sans rien faire (on ne renseigne pas le bot).
  if (d.company && d.company.length > 0) {
    return NextResponse.json({ ok: true });
  }

  try {
    const r = await saveAndNotifyContact({
      name: d.name,
      shop: d.shop,
      email: d.email,
      phone: d.phone,
      message: d.message,
    });
    return NextResponse.json({ ok: true, emailed: r.emailed });
  } catch {
    return jsonError('SERVER_ERROR', 500);
  }
}
