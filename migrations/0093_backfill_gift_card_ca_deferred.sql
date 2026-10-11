-- Migration de DONNÉES (pas de changement de schéma) : rattrape l'historique
-- des lignes d'émission de carte cadeau / bon d'achat vendues en caisse qui
-- n'ont pas encore le marqueur `gift_card_ca_deferred`.
--
-- Contexte : vendre une carte cadeau en caisse (sale_lines.metadata.gift_card
-- = true) existe depuis le 27 juillet 2026. La règle "ce n'est pas du CA tant
-- qu'elle n'est pas dépensée" (metadata.gift_card_ca_deferred = true, lu par
-- toutes les requêtes de CA/marge/TVA — voir lib/analytics/gift-card-ca.ts)
-- n'a été ajoutée que le 26 septembre 2026, et seulement au moment de la
-- VALIDATION d'une vente (lib/services/sale-service.ts) : les ventes
-- validées AVANT cette date ont `gift_card = true` mais jamais
-- `gift_card_ca_deferred`, donc leur carte cadeau restait comptée en CA
-- partout — source de l'écart signalé entre le tableau de bord, l'app CA et
-- l'export comptable pour septembre.
--
-- Rattrape ces ~2 mois (fin juillet - 26 septembre) en ajoutant le marqueur
-- manquant à toutes les lignes concernées, de TOUTES les organisations —
-- règle générale, pas un correctif ciblé à un client précis comme 0088/0089.
-- Ne modifie AUCUN montant, AUCUNE vente : seulement l'étiquette interne qui
-- dit si la ligne compte comme CA. Les totaux de CA d'août/septembre déjà
-- validés baisseront donc légèrement une fois affichés (cartes cadeaux
-- retirées), pour devenir enfin cohérents avec les mois suivants.
UPDATE sale_lines
   SET metadata = metadata || '{"gift_card_ca_deferred": true}'::jsonb
 WHERE metadata->>'gift_card' = 'true'
   AND COALESCE(metadata->>'gift_card_ca_deferred', '') <> 'true';
