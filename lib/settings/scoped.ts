/**
 * Réglages « par boutique » : chaque réglage stocké dans la table `settings`
 * peut être décliné par boutique via une clé namespacée `<clé>:<storeId>`.
 * La clé de base (sans boutique) sert de modèle par défaut / repli tant qu'une
 * boutique n'a pas enregistré sa propre configuration.
 *
 * Ce module est isomorphe (utilisable client et serveur) : il ne contient que
 * la logique de nommage de clé, pas d'accès base.
 */
export function scopedSettingKey(baseKey: string, storeId?: string | null): string {
  return storeId ? `${baseKey}:${storeId}` : baseKey;
}
