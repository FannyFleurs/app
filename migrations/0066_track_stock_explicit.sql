-- « Gérer le stock » devient un choix explicite, article par article.
--
-- Jusqu'ici, la caisse décidait seule : elle décrémentait le stock d'un article
-- s'il avait un code-barres ET n'était pas dans la catégorie « Livraison ».
-- Une règle invisible depuis la fiche produit — on ne pouvait ni la lire ni la
-- contredire. Un bouquet composé au comptoir, sans EAN, n'était jamais suivi ;
-- un article étiqueté l'était forcément, même sans intérêt à l'être.
--
-- La colonne `track_stock` existait déjà (0001) mais n'était lue nulle part.
-- On la remplit avec ce que la caisse faisait RÉELLEMENT jusqu'à présent, pour
-- qu'aucun article ne change de comportement le jour du déploiement. Ensuite,
-- c'est la case de la fiche qui commande.
UPDATE products p
   SET track_stock = TRUE
 WHERE p.barcode IS NOT NULL
   AND btrim(p.barcode) <> ''
   AND COALESCE(
         lower(btrim((SELECT c.name FROM product_categories c WHERE c.id = p.category_id))),
         ''
       ) <> 'livraison';

-- Les articles qui possèdent déjà un niveau de stock non nul sont suivis, même
-- sans code-barres : quelqu'un a saisi cette quantité, la perdre serait un
-- effacement silencieux.
UPDATE products p
   SET track_stock = TRUE
 WHERE p.track_stock = FALSE
   AND EXISTS (
     SELECT 1 FROM stock_levels sl
      WHERE sl.product_id = p.id AND sl.quantity <> 0
   );
