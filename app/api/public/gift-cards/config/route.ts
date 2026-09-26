import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { resolveOrgByPublicKey } from '@/lib/settings/online-gift-cards-server';

export const dynamic = 'force-dynamic';

/**
 * Contrat public de l'intégration « Cartes cadeaux en ligne » — documenté
 * dans docs/api-public-gift-cards.md.
 *
 * AUCUNE session HelloPos requise. L'organisation est déterminée
 * EXCLUSIVEMENT par la clé publique `key` (hp_gc_...) — jamais par un
 * organization_id fourni par l'appelant, qui n'existe nulle part dans ce
 * fichier ni dans le contrat de réponse.
 *
 * Cette étape ne fait QUE lire la configuration : aucun paiement, aucune
 * carte cadeau créée ici.
 */

const NOT_AVAILABLE = { error: 'GIFT_CARDS_NOT_AVAILABLE' } as const;

/**
 * Forme minimale attendue AVANT même d'interroger la base : rejette vite un
 * paramètre manifestement malformé sans révéler d'information ni faire de
 * requête inutile.
 */
function looksLikePublicKey(key: string): boolean {
  return /^hp_gc_[A-Za-z0-9_-]{10,}$/.test(key);
}

/**
 * Résout la clé en organisation + réglage, uniquement si TOUT est valide :
 * clé bien formée, clé connue, intégration active, organisation active.
 * Renvoie `null` pour CHAQUE cas d'échec, sans distinction — voir le
 * commentaire sur `GET` pour pourquoi c'est important.
 */
async function resolve(req: Request): Promise<{ organizationName: string; giftCards: {
  preset_amounts: number[]; allow_custom_amount: boolean; min_amount: number; max_amount: number;
}; allowedOrigins: string[] } | null> {
  const key = new URL(req.url).searchParams.get('key') ?? '';
  if (!looksLikePublicKey(key)) return null;

  const resolved = await resolveOrgByPublicKey(key);
  if (!resolved || !resolved.settings.enabled) return null;

  const org = await query<{ name: string }>(
    `SELECT name FROM organizations WHERE id = $1 AND is_active = TRUE`,
    [resolved.organizationId],
  );
  const name = org.rows[0]?.name;
  if (!name) return null;

  const s = resolved.settings;
  return {
    organizationName: name,
    giftCards: {
      preset_amounts: s.preset_amounts,
      allow_custom_amount: s.allow_custom_amount,
      min_amount: s.min_amount,
      max_amount: s.max_amount,
    },
    allowedOrigins: s.allowed_origins,
  };
}

/**
 * CORS : `allowed_origins` est une protection NAVIGATEUR, pas une
 * authentification (la clé hp_gc_... est elle-même publique — voir la doc).
 * On n'ajoute l'en-tête que pour une origine explicitement autorisée par
 * CETTE organisation, jamais `*`. Sans en-tête Origin (curl, SSR, appel
 * serveur à serveur) : aucun en-tête CORS à ajouter, mais la requête aboutit
 * normalement — la réponse ne contient rien de sensible.
 */
function corsHeaders(req: Request, allowedOrigins: string[]): HeadersInit {
  const origin = req.headers.get('origin');
  if (!origin || !allowedOrigins.includes(origin)) return {};
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
}

export async function GET(req: Request) {
  const resolved = await resolve(req);
  // Réponse volontairement IDENTIQUE (statut + corps) pour : clé inconnue,
  // clé malformée, intégration désactivée, organisation introuvable/inactive.
  // Distinguer ces cas publiquement permettrait d'énumérer les organisations
  // ou de deviner qu'une clé existe. Par la même logique, aucun en-tête CORS
  // n'est ajouté ici : on ne connaît pas encore les origines autorisées d'une
  // organisation qu'on ne révèle pas avoir trouvée.
  if (!resolved) {
    return NextResponse.json(NOT_AVAILABLE, { status: 404 });
  }

  return NextResponse.json(
    {
      enabled: true,
      organization: { name: resolved.organizationName },
      gift_cards: resolved.giftCards,
    },
    { headers: corsHeaders(req, resolved.allowedOrigins) },
  );
}

/**
 * Un GET simple avec un paramètre de requête (pas d'en-tête personnalisé, pas
 * de credentials) est une « requête simple » CORS : la plupart des
 * navigateurs n'envoient PAS de préflight OPTIONS pour l'appeler. On la gère
 * quand même, par robustesse (proxies, futurs clients, en-têtes ajoutés
 * plus tard) — avec la même résolution clé → origines autorisées que GET.
 */
export async function OPTIONS(req: Request) {
  const resolved = await resolve(req);
  if (!resolved) return new NextResponse(null, { status: 204 });
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...corsHeaders(req, resolved.allowedOrigins),
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
