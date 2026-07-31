-- Largeur papier de l'imprimante ticket CloudPRNT (58 ou 80 mm) : conditionne
-- le nombre de colonnes du ticket StarPRNT. Sans effet pour les étiquettes.
ALTER TABLE cloudprnt_printers
  ADD COLUMN IF NOT EXISTS paper_width SMALLINT NOT NULL DEFAULT 80;
