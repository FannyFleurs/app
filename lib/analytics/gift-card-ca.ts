/**
 * Règle comptable unique pour les cartes cadeaux / bons d'achat VENDUS en
 * caisse : leur émission est un ENCAISSEMENT (une dette envers le client),
 * pas du chiffre d'affaires — la vente ne devient du CA (et ne déclenche la
 * TVA, déjà à 0 % sur ces lignes) que lorsque le client la DÉPENSE, via un
 * règlement normal (payments.method = 'gift_card') sur une AUTRE vente dont
 * les lignes sont les vrais produits achetés.
 *
 * Toute requête qui calcule un CA, une marge ou une répartition de TVA à
 * partir de `sale_lines` DOIT exclure ces lignes avec cette même condition —
 * sinon elle compte deux fois le même encaissement (une fois à l'émission,
 * une fois, correctement, sur la vente où la carte est dépensée). Avant
 * cette constante, la condition était dupliquée (et parfois absente, ou
 * basée sur l'ancien marqueur `gift_card` plutôt que `gift_card_ca_deferred`)
 * dans une douzaine d'endroits différents, avec des résultats divergents
 * selon l'écran consulté — voir migration 0093 pour le rattrapage de
 * l'historique concerné.
 *
 * Suppose l'alias `sl` pour `sale_lines` dans la requête appelante.
 */
export const EXCLUDE_GIFT_CARD_ISSUANCE_SQL =
  `COALESCE(sl.metadata->>'gift_card_ca_deferred', '') <> 'true'`;
