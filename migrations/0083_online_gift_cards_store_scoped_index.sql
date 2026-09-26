-- Cartes cadeaux en ligne RATTACHÉES À UNE BOUTIQUE : une organisation
-- multi-boutiques peut désormais avoir une configuration "online_gift_cards"
-- PAR BOUTIQUE (clé `online_gift_cards:<storeId>`, mécanisme générique déjà
-- utilisé par cash/facturation/imprimante — voir lib/settings/scoped.ts),
-- en plus de l'éventuelle configuration historique au niveau organisation
-- (clé exacte `online_gift_cards`, déjà indexée par la migration 0079,
-- inchangée).
--
-- Cette migration est PUREMENT ADDITIVE : elle ne modifie ni ne supprime
-- rien de l'index existant (migration 0079). Elle ajoute un second index
-- d'expression partiel, sur le même motif que le premier, mais pour les
-- clés par boutique — la résolution publique (resolveOrgByPublicKey) fait
-- désormais `WHERE key = 'online_gift_cards' OR key LIKE
-- 'online_gift_cards:%'`, que PostgreSQL peut satisfaire en combinant les
-- deux index partiels (bitmap OR) sans jamais scanner la table `settings`
-- entière.
CREATE INDEX IF NOT EXISTS idx_settings_online_gift_cards_public_key_store
  ON settings ((value->>'public_key'))
  WHERE key LIKE 'online_gift_cards:%';
