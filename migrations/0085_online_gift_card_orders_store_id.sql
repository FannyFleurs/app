-- Rattache chaque commande de carte cadeau en ligne à la BOUTIQUE dont la
-- clé publique a servi à l'achat (résolue serveur, jamais fournie par le
-- navigateur — voir lib/settings/online-gift-cards-server.ts). Nullable :
-- une commande créée AVANT cette évolution (configuration encore au niveau
-- organisation) n'a pas de boutique connue, et ne DOIT PAS en recevoir une
-- deviné rétroactivement — voir la note sur la non-rétroactivité comptable
-- dans docs/architecture-multi-store-stripe.md.
--
-- Le titulaire de la carte cadeau elle-même (`gift_cards`) reste, lui,
-- SANS store_id : une carte cadeau appartient à l'organisation et reste
-- utilisable dans toutes ses boutiques — cette évolution ne change rien à
-- cet invariant, déjà établi. `online_gift_card_orders.store_id` ne sert
-- QUE pour la boutique et le compte Stripe de VENTE, jamais pour
-- restreindre où la carte pourra être utilisée.
ALTER TABLE online_gift_card_orders
  ADD COLUMN store_id UUID REFERENCES stores(id) ON DELETE RESTRICT;

CREATE INDEX idx_online_gift_card_orders_store ON online_gift_card_orders (store_id);
