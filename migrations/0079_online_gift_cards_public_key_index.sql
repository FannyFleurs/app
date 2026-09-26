-- Lookup indexé de la clé publique d'intégration "cartes cadeaux en ligne"
-- (hp_gc_...). L'API PUBLIQUE de l'étape 2 doit retrouver l'organisation
-- UNIQUEMENT à partir de cette clé, et sera appelée par des sites tiers (donc
-- potentiellement plus souvent qu'un réglage d'admin) : contrairement au
-- lookup par jeton de order_integration (peu d'organisations concernées, scan
-- + comparaison en mémoire tolérable), un scan de tous les settings ici
-- serait le mauvais choix. Index d'expression partiel : ne porte que sur les
-- lignes de cette intégration (key = 'online_gift_cards'), sur le champ
-- JSONB public_key — la table `settings` et son écriture (étape 1) ne
-- changent pas.
CREATE INDEX IF NOT EXISTS idx_settings_online_gift_cards_public_key
  ON settings ((value->>'public_key'))
  WHERE key = 'online_gift_cards';
