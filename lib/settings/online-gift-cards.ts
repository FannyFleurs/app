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
import { round2 } from '@/lib/services/money';

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
  /** Montants proposés en euros, triés croissant, sans doublon. */
  preset_amounts: number[];
  /** Autorise l'acheteur à saisir un montant libre (entre min_amount et max_amount). */
  allow_custom_amount: boolean;
  /** Montant minimum en euros (> 0). */
  min_amount: number;
  /** Montant maximum en euros (> min_amount). */
  max_amount: number;
}

export const ONLINE_GIFT_CARDS_DEFAULTS: OnlineGiftCardsSettings = {
  enabled: false,
  public_key: '',
  allowed_origins: [],
  created_at: '',
  preset_amounts: [25, 50, 75, 100],
  allow_custom_amount: true,
  min_amount: 10,
  max_amount: 500,
};

export function mergeOnlineGiftCardsDefaults(
  partial: Partial<OnlineGiftCardsSettings> | null | undefined,
): OnlineGiftCardsSettings {
  if (!partial) return { ...ONLINE_GIFT_CARDS_DEFAULTS, allowed_origins: [], preset_amounts: [...ONLINE_GIFT_CARDS_DEFAULTS.preset_amounts] };
  return {
    enabled: partial.enabled ?? ONLINE_GIFT_CARDS_DEFAULTS.enabled,
    public_key: partial.public_key ?? ONLINE_GIFT_CARDS_DEFAULTS.public_key,
    allowed_origins: Array.isArray(partial.allowed_origins) ? partial.allowed_origins : [],
    created_at: partial.created_at ?? ONLINE_GIFT_CARDS_DEFAULTS.created_at,
    preset_amounts: Array.isArray(partial.preset_amounts)
      ? partial.preset_amounts : [...ONLINE_GIFT_CARDS_DEFAULTS.preset_amounts],
    allow_custom_amount: partial.allow_custom_amount ?? ONLINE_GIFT_CARDS_DEFAULTS.allow_custom_amount,
    min_amount: partial.min_amount ?? ONLINE_GIFT_CARDS_DEFAULTS.min_amount,
    max_amount: partial.max_amount ?? ONLINE_GIFT_CARDS_DEFAULTS.max_amount,
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

/** Nombre maximum de montants proposés — hygiène, pas une vraie limite métier. */
export const MAX_PRESET_AMOUNTS = 10;

export class InvalidAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAmountError';
  }
}

export interface GiftCardCommerceInput {
  preset_amounts: number[];
  allow_custom_amount: boolean;
  min_amount: number;
  max_amount: number;
}

/**
 * Valide et normalise la configuration commerciale (montants proposés,
 * montant libre, bornes min/max). Lève une `InvalidAmountError` explicite au
 * premier problème plutôt que de corriger/retirer silencieusement une valeur
 * incohérente — l'admin doit voir précisément ce qui cloche.
 *
 * Les montants sont arrondis au centime (`round2`, même règle que le reste de
 * la caisse) : on évite ainsi les valeurs binaires flottantes du type
 * 25.5000000000000004 avant stockage.
 */
export function validateGiftCardCommerceConfig(input: GiftCardCommerceInput): {
  preset_amounts: number[]; allow_custom_amount: boolean; min_amount: number; max_amount: number;
} {
  if (typeof input.allow_custom_amount !== 'boolean') {
    throw new InvalidAmountError('« Autoriser le montant libre » doit être vrai ou faux.');
  }
  if (typeof input.min_amount !== 'number' || !Number.isFinite(input.min_amount)) {
    throw new InvalidAmountError('Montant minimum invalide.');
  }
  if (typeof input.max_amount !== 'number' || !Number.isFinite(input.max_amount)) {
    throw new InvalidAmountError('Montant maximum invalide.');
  }
  const min = round2(input.min_amount);
  const max = round2(input.max_amount);
  if (!(min > 0)) throw new InvalidAmountError('Le montant minimum doit être supérieur à 0.');
  if (!(max > min)) throw new InvalidAmountError('Le montant maximum doit être supérieur au montant minimum.');

  if (!Array.isArray(input.preset_amounts)) {
    throw new InvalidAmountError('Montants proposés invalides.');
  }
  if (input.preset_amounts.length > MAX_PRESET_AMOUNTS) {
    throw new InvalidAmountError(`Trop de montants proposés (maximum ${MAX_PRESET_AMOUNTS}).`);
  }
  const seen = new Set<number>();
  for (const raw of input.preset_amounts) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      throw new InvalidAmountError('Montant proposé invalide.');
    }
    const amount = round2(raw);
    if (!(amount > 0)) throw new InvalidAmountError(`Montant invalide : ${amount} €.`);
    if (amount < min || amount > max) {
      throw new InvalidAmountError(`Le montant ${amount} € doit être compris entre ${min} € et ${max} €.`);
    }
    if (seen.has(amount)) throw new InvalidAmountError(`Montant en double : ${amount} €.`);
    seen.add(amount);
  }

  const preset_amounts = [...seen].sort((a, b) => a - b);
  return { preset_amounts, allow_custom_amount: input.allow_custom_amount, min_amount: min, max_amount: max };
}

/**
 * Forme minimale attendue d'une clé publique AVANT même d'interroger la base
 * — rejette vite un paramètre manifestement malformé, sans requête inutile
 * ni information révélée. Partagé par l'API publique de configuration
 * (étape 2) et celle de paiement (étape 3).
 */
export function looksLikePublicKey(key: string): boolean {
  return /^hp_gc_[A-Za-z0-9_-]{10,}$/.test(key);
}

/**
 * Un montant (en euros) est-il achetable pour cette organisation ? Un
 * montant proposé (`preset_amounts`) est TOUJOURS valide, que le montant
 * libre soit autorisé ou non ; sinon, il faut `allow_custom_amount` ET être
 * compris entre `min_amount` et `max_amount`.
 */
export function isGiftCardAmountAllowed(
  amountEuros: number,
  cfg: Pick<OnlineGiftCardsSettings, 'preset_amounts' | 'allow_custom_amount' | 'min_amount' | 'max_amount'>,
): boolean {
  if (typeof amountEuros !== 'number' || !Number.isFinite(amountEuros)) return false;
  const amount = round2(amountEuros);
  if (cfg.preset_amounts.some((p) => round2(p) === amount)) return true;
  if (!cfg.allow_custom_amount) return false;
  return amount >= cfg.min_amount && amount <= cfg.max_amount;
}

/**
 * Chemins de retour par défaut après un Checkout — utilisés quand le site
 * appelant n'en fournit pas explicitement (voir `validateReturnPath` et
 * docs/api-public-gift-cards.md, section Checkout).
 */
export const DEFAULT_SUCCESS_PATH = '/carte-cadeau/succes';
export const DEFAULT_CANCEL_PATH = '/carte-cadeau';

/**
 * Valide un chemin de retour (success_path / cancel_path) fourni par le site
 * appelant : jamais une URL absolue, jamais un chemin protocole-relatif
 * (`//evil.com`), jamais de changement d'origine. Le serveur reconstruit
 * ensuite lui-même `origineValidée + chemin` — le navigateur ne choisit
 * JAMAIS l'origine de la redirection, seulement le chemin sur CELLE de
 * l'organisation résolue. `undefined` (champ absent) renvoie `fallback`
 * (chemin par défaut) ; toute autre valeur invalide renvoie `null`.
 */
export function validateReturnPath(raw: string | undefined, fallback: string): string | null {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string') return null;
  if (raw.length === 0 || raw.length > 200) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//')) return null; // protocole-relatif (//evil.com)
  if (raw.includes('://')) return null;
  if (raw.includes('\\')) return null; // certains parseurs traitent \ comme /
  // Chemin strict : segments, tirets/underscores, points (extensions) —
  // explicitement PAS de `?`/`&`/`=` : la query de retour Stripe
  // (?session_id=...) est ajoutée par le serveur, jamais par l'appelant.
  if (!/^\/[A-Za-z0-9\-_/.]*$/.test(raw)) return null;
  return raw;
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
