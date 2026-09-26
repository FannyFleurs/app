import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Chiffrement applicatif au repos pour les secrets sensibles stockés dans la
 * table `settings` (JSONB), à commencer par les identifiants Stripe par
 * boutique. HelloPos n'avait jusqu'ici AUCUN mécanisme de ce type (audité
 * avant cette évolution) : les secrets étaient protégés uniquement par la
 * RLS multi-tenant + le masquage à l'affichage (`maskKey`). Multiplier les
 * comptes Stripe par boutique justifie d'ajouter un vrai chiffrement.
 *
 * Algorithme : AES-256-GCM (chiffrement authentifié natif de `node:crypto`,
 * aucune dépendance ajoutée) — IV aléatoire de 96 bits par valeur (jamais
 * réutilisé), tag d'authentification de 128 bits vérifié au déchiffrement
 * (falsification/troncature détectée, jamais silencieusement acceptée).
 *
 * Format de stockage (chaîne, versionné) :
 *   "enc:v1:" + base64(iv[12] || authTag[16] || ciphertext)
 * Une valeur SANS ce préfixe est traitée comme un secret EN CLAIR existant
 * (donnée héritée d'avant ce mécanisme, ou écrite alors que la clé maître
 * n'était pas encore configurée) — jamais rejetée, jamais corrompue par une
 * tentative de déchiffrement : `decryptSecret` la renvoie telle quelle.
 * C'est ce qui permet une migration progressive et sûre (voir plus bas).
 *
 * Clé maître : variable d'environnement `SECRETS_ENCRYPTION_KEY` (64
 * caractères hex = 256 bits, générée par ex. avec `openssl rand -hex 32`,
 * même convention que `FISCAL_SIGNING_KEY`/`SESSION_SECRET` déjà utilisées
 * par HelloPos). JAMAIS stockée en base, jamais envoyée au navigateur,
 * jamais journalisée (ce module ne logge jamais la clé ni un secret en
 * clair — seuls les codes d'erreur ci-dessous le sont, via les appelants).
 *
 * Migration sans casse : tant que `SECRETS_ENCRYPTION_KEY` n'est pas encore
 * définie en production, `encryptSecret` renvoie la valeur EN CLAIR
 * (comportement actuel inchangé, zéro régression) et `decryptSecret` sait
 * lire les valeurs déjà en clair. Une fois la variable posée, chaque
 * prochaine ÉCRITURE (sauvegarde d'un réglage Stripe) chiffre
 * automatiquement la nouvelle valeur — migration "au fil de l'eau", sans
 * script de migration de masse à risque sur des secrets de production. Voir
 * docs/architecture-multi-store-stripe.md pour la procédure de déploiement
 * complète (ordre des étapes, variable Vercel à ajouter).
 */

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc:v1:';
const IV_LENGTH = 12; // 96 bits, taille recommandée pour GCM
const TAG_LENGTH = 16; // 128 bits

export class SecretCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretCryptoError';
  }
}

/** La clé maître est-elle configurée dans cet environnement ? Permet aux
 *  écrans d'admin d'afficher un avertissement clair si non — jamais la
 *  clé elle-même. */
export function isEncryptionConfigured(): boolean {
  return !!process.env.SECRETS_ENCRYPTION_KEY;
}

function loadMasterKey(): Buffer | null {
  const hex = process.env.SECRETS_ENCRYPTION_KEY;
  if (!hex) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    // Configuration manifestement invalide : erreur explicite plutôt qu'un
    // chiffrement silencieusement faux avec une clé tronquée/dérivée.
    throw new SecretCryptoError(
      'SECRETS_ENCRYPTION_KEY doit être une chaîne hexadécimale de 64 caractères (256 bits) — générez-la avec `openssl rand -hex 32`.',
    );
  }
  return Buffer.from(hex, 'hex');
}

/** Une valeur porte-t-elle déjà le format chiffré de ce module ? */
export function isEncryptedSecret(value: string): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/**
 * Chiffre `plaintext`. Si aucune clé maître n'est configurée dans cet
 * environnement, renvoie `plaintext` INCHANGÉ (comportement d'avant ce
 * module — jamais d'échec au démarrage d'un déploiement qui n'a pas encore
 * la variable d'environnement). Une chaîne vide reste une chaîne vide
 * (« non configuré » doit rester détectable tel quel, jamais chiffré).
 */
export function encryptSecret(plaintext: string): string {
  if (plaintext === '') return '';
  const key = loadMasterKey();
  if (!key) return plaintext;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

/**
 * Déchiffre une valeur produite par `encryptSecret`. Une valeur qui ne
 * porte pas le préfixe `enc:v1:` est considérée EN CLAIR (donnée héritée,
 * ou écrite sans clé configurée) et renvoyée telle quelle — jamais une
 * tentative de déchiffrement hasardeuse sur du texte qui n'est pas du
 * ciphertext.
 *
 * Lève `SecretCryptoError` si la valeur EST au format chiffré mais que la
 * clé maître est absente, invalide, ou que l'authentification GCM échoue
 * (clé incorrecte ou donnée corrompue/tronquée) — jamais un déchiffrement
 * partiel ou silencieusement faux.
 */
export function decryptSecret(stored: string): string {
  if (!isEncryptedSecret(stored)) return stored;
  const key = loadMasterKey();
  if (!key) {
    throw new SecretCryptoError(
      'Valeur chiffrée présente mais SECRETS_ENCRYPTION_KEY est absente dans cet environnement : déchiffrement impossible.',
    );
  }
  const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
  if (raw.length < IV_LENGTH + TAG_LENGTH) {
    throw new SecretCryptoError('Valeur chiffrée invalide (trop courte).');
  }
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // Jamais le détail de l'exception native (peut varier) : un code stable,
    // jamais de fuite du contenu ni de la clé.
    throw new SecretCryptoError('Déchiffrement impossible (clé incorrecte ou donnée corrompue).');
  }
}

/**
 * Compare deux secrets EN CLAIR en temps constant (évite une fuite par
 * timing sur une comparaison `===` naïve). Non utilisé pour l'instant par
 * ce module lui-même, mais exposé pour les appelants qui compareraient un
 * secret déchiffré à une valeur fournie par l'utilisateur.
 */
export function secretsEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
