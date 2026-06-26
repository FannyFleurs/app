-- Corrige le trigger fn_protect_validated_invoice qui empêchait la pose
-- initiale du fiscal_hash juste après l'INSERT (cas standard du flux
-- InvoiceService.create : INSERT avec status='paid' fiscal_hash=NULL,
-- puis UPDATE pour poser le hash). Le trigger renvoyait
-- INVOICE_IMMUTABLE alors qu'il s'agit de la pose initiale.
--
-- Comportement attendu :
--   - Pose initiale du fiscal_hash (OLD.fiscal_hash IS NULL) → autorisée.
--   - Modification ultérieure du hash, ou du total / numéro → toujours
--     bloquée (RAISE INVOICE_IMMUTABLE).

CREATE OR REPLACE FUNCTION fn_protect_validated_invoice() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'INVOICE_IMMUTABLE: suppression interdite'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    END IF;
    IF OLD.status IN ('validated','sent','paid','partially_paid','overdue','cancelled') THEN
        -- On bloque la modification des champs fiscaux SAUF la pose
        -- initiale du fiscal_hash (NULL → valeur).
        IF NEW.total_ht <> OLD.total_ht
           OR NEW.total_tva <> OLD.total_tva
           OR NEW.total_ttc <> OLD.total_ttc
           OR NEW.number IS DISTINCT FROM OLD.number
           OR (OLD.fiscal_hash IS NOT NULL
               AND NEW.fiscal_hash IS DISTINCT FROM OLD.fiscal_hash) THEN
            RAISE EXCEPTION 'INVOICE_IMMUTABLE: modification interdite'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
