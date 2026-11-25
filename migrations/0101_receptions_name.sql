-- Nom personnalisé d'une réception, pour la retrouver plus facilement sur le
-- PDA quand le nom du fichier importé n'est pas assez parlant (ou qu'il n'y
-- en a pas, pour une réception créée manuellement). Facultatif : l'affichage
-- retombe sur le nom du fichier, puis sur « Réception manuelle ».
ALTER TABLE receptions ADD COLUMN name TEXT;
