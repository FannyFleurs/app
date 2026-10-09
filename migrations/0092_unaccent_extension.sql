-- Recherche clients insensible aux accents (ex. « Alencon » retrouve
-- « Alençon », « elise » retrouve « Élise »), en plus de la casse (déjà
-- gérée via lower()) — voir app/api/customers/route.ts.
CREATE EXTENSION IF NOT EXISTS unaccent;
