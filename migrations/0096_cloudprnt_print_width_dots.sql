-- Largeur d'impression réduite pour une imprimante CloudPRNT 80 mm (ex. 512
-- points au lieu des 576 standard) : certains modèles/têtes d'impression
-- rendent mieux en largeur réduite, sans changer le papier physique utilisé
-- (reste 80 mm — voir paper_width). NULL = dérivée de paper_width comme
-- avant (80 mm -> 576, 58 mm -> 384) ; explicite seulement pour forcer 512.
ALTER TABLE cloudprnt_printers
  ADD COLUMN IF NOT EXISTS print_width_dots SMALLINT;
