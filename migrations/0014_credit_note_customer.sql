-- Lien direct credit_notes → customer_id pour que l'avoir apparaisse
-- toujours sur la fiche du client qui l'a reçu, même si la vente
-- d'origine n'était pas attachée à un client (vente anonyme).
ALTER TABLE credit_notes
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id),
  ADD COLUMN IF NOT EXISTS refund_method TEXT;

-- Rétro-remplissage depuis la vente d'origine quand possible.
UPDATE credit_notes cn
   SET customer_id = s.customer_id
  FROM sales s
 WHERE cn.sale_id = s.id
   AND cn.customer_id IS NULL
   AND s.customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credit_notes_customer
  ON credit_notes (organization_id, customer_id)
  WHERE customer_id IS NOT NULL;
