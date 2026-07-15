-- Fusion des doublons de stock_levels + garde-fou anti-doublon.
--
-- Un bug de l'entrée de stock manuelle (ON CONFLICT inopérant lorsque
-- variant_id est NULL : les NULL SQL sont distincts) créait une NOUVELLE ligne
-- de stock au lieu de mettre à jour l'existante. On fusionne ici les doublons
-- déjà créés (somme des quantités dans la ligne la plus ancienne), puis on
-- empêche toute récidive côté base, en complément du correctif applicatif.

-- 1. Cumule les quantités des doublons dans la ligne conservée (MIN(id)).
--    En GROUP BY, les variant_id NULL sont regroupés (NULL = NULL), ce qui est
--    exactement le comportement voulu.
UPDATE stock_levels sl
   SET quantity = agg.total, updated_at = now()
  FROM (
    SELECT store_id, product_id, variant_id,
           MIN(id::text)::uuid AS keep_id, SUM(quantity) AS total
      FROM stock_levels
     GROUP BY store_id, product_id, variant_id
    HAVING COUNT(*) > 1
  ) agg
 WHERE sl.id = agg.keep_id;

-- 2. Supprime les lignes en doublon (toutes sauf la conservée).
DELETE FROM stock_levels sl
 USING (
    SELECT store_id, product_id, variant_id, MIN(id::text)::uuid AS keep_id
      FROM stock_levels
     GROUP BY store_id, product_id, variant_id
    HAVING COUNT(*) > 1
  ) agg
 WHERE sl.store_id = agg.store_id
   AND sl.product_id = agg.product_id
   AND sl.variant_id IS NOT DISTINCT FROM agg.variant_id
   AND sl.id <> agg.keep_id;

-- 3. Garde-fou base : index unique NULLS NOT DISTINCT (PostgreSQL 15+), qui
--    fait matcher deux lignes à variant_id NULL. Best effort : si la version
--    ne le supporte pas, le correctif applicatif (lecture verrouillée
--    NULL-safe) suffit à empêcher les doublons.
DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS stock_levels_store_prod_variant_uniq '
         || 'ON stock_levels (store_id, product_id, variant_id) NULLS NOT DISTINCT';
    ALTER TABLE stock_levels
      DROP CONSTRAINT IF EXISTS stock_levels_store_id_product_id_variant_id_key;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'stock_levels NULLS NOT DISTINCT non appliqué (%): correctif applicatif suffisant', SQLERRM;
  END;
END $$;
