-- Garantie DB supplémentaire (défense en profondeur, EN PLUS du verrou de
-- ligne pris par fulfillOnlineGiftCardCheckout — SELECT ... FOR UPDATE dans
-- une transaction) : une carte cadeau ne peut jamais être rattachée qu'à
-- UNE SEULE commande en ligne. NULL autorisé plusieurs fois (comportement
-- standard d'un UNIQUE Postgres) : les commandes pas encore émises
-- n'entrent pas en collision entre elles.
ALTER TABLE online_gift_card_orders
  ADD CONSTRAINT online_gift_card_orders_gift_card_id_key UNIQUE (gift_card_id);
