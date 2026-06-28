-- Permet de générer un lien Stripe Checkout pour une vente caisse
-- (et pas seulement pour une commande différée). Le commerçant choisit
-- "Lien Stripe" dans la modale de règlement, la vente est validée
-- fiscalement, puis on génère le lien et on l'envoie au client par email.
-- Le webhook /api/webhooks/stripe traite désormais sale_id en plus
-- de order_id et met à jour payment_status='paid' + paid_at.

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS payment_status TEXT
       CHECK (payment_status IN ('pending','paid','failed','refunded')),
  ADD COLUMN IF NOT EXISTS payment_link_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_link_session_id TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sales_payment_session
  ON sales (payment_link_session_id)
  WHERE payment_link_session_id IS NOT NULL;
