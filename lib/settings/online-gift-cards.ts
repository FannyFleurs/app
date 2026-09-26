/**
 * Intégration « Cartes cadeaux en ligne » : permet à une organisation de
 * proposer, depuis son propre site internet, l'achat des cartes cadeaux
 * HelloPos existantes (`gift_cards`, niveau ORGANISATION — pas boutique).
 *
 * Cette étape ne construit que la configuration de l'intégration (clé
 * publique + domaines autorisés) : ni page de vente publique, ni Checkout
 * Stripe, ni webhook de paiement. Le système de cartes cadeaux existant
 * (`GiftCardService`, `/api/gift-cards`) reste inchangé et reste la seule
 * source de vérité pour la création/l'utilisation des cartes.
 *
 * Stocké dans `settings` (table générique clé/valeur, même mécanisme que
 * `stripe`, `order_integration`, `tva`, etc. — pas de table dédiée).
 */

import { randomBytes } from 'node:crypto';

export const ONLINE_GIFT_CARDS_KEY = 'online_gift_cards';

export interface OnlineGiftCardsSettings {
  /** Vente en ligne activée pour cette organisation. */
  enabled: boolean;
  /**
   * Identifiant PUBLIC de l'intégration (ex. `hp_gc_xxxxxxxxxxxxxxxxx`) —
   * sert à un futur site public à indiquer QUELLE organisation il concerne.
   * Ce n'est PAS un secret : il n'authentifie rien, il ne fait qu'identifier.
   */
  public_key: string;
  /** Origines autorisées à utiliser cette intégration (normalisées, sans slash final). */
  allowed_origins: string[];
  /** Date de première configuration (la table `settings` ne garde qu'`updated_at`). */
  created_at: string;
}

export const ONLINE_GIFT_CARDS_DEFAULTS: OnlineGiftCardsSettings = {
  enabled: false,
  public_key: '',
  allowed_origins: [],
  created_at: '',
};

export function mergeOnlineGiftCardsDefaults(
  partial: Partial<OnlineGiftCardsSettings> | null | undefined,
): OnlineGiftCardsSettings {
  if (!partial) return { ...ONLINE_GIFT_CARDS_DEFAULTS, allowed_origins: [] };
  return {
    enabled: partial.enabled ?? ONLINE_GIFT_CARDS_DEFAULTS.enabled,
    public_key: partial.public_key ?? ONLINE_GIFT_CARDS_DEFAULTS.public_key,
    allowed_origins: Array.isArray(partial.allowed_origins) ? partial.allowed_origins : [],
    created_at: partial.created_at ?? ONLINE_GIFT_CARDS_DEFAULTS.created_at,
  };
}

/** Nombre maximum de domaines autorisés — hygiène, pas une vraie limite métier. */
export const MAX_ALLOWED_ORIGINS = 10;

/** Hôtes locaux tolérés en http:// (dev uniquement) ; sinon https obligatoire. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Normalise une origine saisie par l'utilisateur en forme canonique
 * `protocole//hôte[:port]`, sans chemin ni slash final. Renvoie `null` si la
 * valeur n'est pas une origine web valide (protocole non http/https, chemin,
 * requête, fragment, ou chaîne non parsable comme URL).
 */
export function normalizeOrigin(raw: string): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  // Exclut javascript:, data:, mailto:, etc. — seuls http/https représentent
  // un site capable d'appeler l'intégration.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  // http:// toléré uniquement pour un développement local.
  if (url.protocol === 'http:' && !LOCAL_HOSTS.has(url.hostname)) return null;
  if (!url.hostname) return null;
  // Une ORIGINE, pas une URL quelconque : ni chemin, ni requête, ni fragment.
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) return null;
  return `${url.protocol}//${url.host}`;
}

export function isValidOrigin(raw: string): boolean {
  return normalizeOrigin(raw) !== null;
}

/**
 * Normalise et déduplique une liste d'origines. Lève si l'une d'elles est
 * invalide (avec la valeur fautive, pour un message d'erreur explicite côté
 * API) plutôt que de la retirer silencieusement.
 */
export function normalizeOrigins(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const normalized = normalizeOrigin(item);
    if (!normalized) throw new InvalidOriginError(item);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  if (out.length > MAX_ALLOWED_ORIGINS) {
    throw new Error(`Trop de domaines (max ${MAX_ALLOWED_ORIGINS}).`);
  }
  return out;
}

export class InvalidOriginError extends Error {
  constructor(public readonly value: string) {
    super(`Domaine invalide : "${value}"`);
    this.name = 'InvalidOriginError';
  }
}

/**
 * Clé publique d'intégration : préfixe repérable + 20 octets aléatoires en
 * base64url (non séquentielle, non devinable). Ce n'est PAS un secret — elle
 * identifie publiquement l'organisation à un futur site de vente, elle ne
 * prouve rien. Format : hp_gc_xxxxxxxxxxxxxxxxxxxxxxxxxxx
 *
 * Pure (pas d'accès DB) : reste dans ce module isomorphe plutôt que
 * `-server.ts`, pour rester testable directement comme le reste du fichier.
 */
export function generatePublicKey(): string {
  return `hp_gc_${randomBytes(20).toString('base64url')}`;
}
