-- ---------------------------------------------------------------------------
-- 0037 — Support des ventes hors-ligne (mode dégradé réseau)
-- ---------------------------------------------------------------------------
-- Une vente encaissée hors-ligne est enregistrée localement (IndexedDB) puis
-- rejouée vers le serveur à la reprise réseau, qui la SCELLE (même chaîne
-- fiscale que d'habitude). Pour éviter les doublons lors des rejeux :
--   - client_ref : identifiant unique généré par le poste (idempotence).
--   - occurred_at : horodatage RÉEL de l'encaissement (pendant la coupure).
-- ---------------------------------------------------------------------------

ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_ref  TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ;

-- Idempotence : une même vente hors-ligne (client_ref) ne peut être scellée
-- qu'une seule fois par organisation.
CREATE UNIQUE INDEX IF NOT EXISTS sales_org_client_ref_uk
  ON sales (organization_id, client_ref)
  WHERE client_ref IS NOT NULL;
