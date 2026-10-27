-- Généralise "lot d'import" (import_batches/import_batch_items) en
-- "réception" : une réception peut désormais venir d'un import de fichier
-- (filename renseigné) OU être créée manuellement depuis Paramètres →
-- Réceptions, par simple sélection d'articles déjà existants (filename
-- NULL). Même mécanique PDA dans les deux cas.
ALTER TABLE import_batches RENAME TO receptions;
ALTER TABLE import_batch_items RENAME TO reception_items;
ALTER TABLE reception_items RENAME COLUMN import_batch_id TO reception_id;
ALTER INDEX idx_import_batches_org_pda RENAME TO idx_receptions_org_pda;
ALTER INDEX idx_import_batch_items_batch RENAME TO idx_reception_items_reception;
