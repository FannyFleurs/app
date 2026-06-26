-- Paiement différé par lien Stripe sur les commandes (retrait à date / livraison).
-- L'API /api/orders/[id]/payment-link crée une session Stripe Checkout,
-- envoie le lien au client par email, et le webhook /api/webhooks/stripe
-- met à jour payment_status='paid' + paid_at quand la session aboutit.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending'
       CHECK (payment_status IN ('pending','paid','failed','refunded')),
  ADD COLUMN IF NOT EXISTS payment_link_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_link_session_id TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_payment_session
  ON orders (payment_link_session_id)
  WHERE payment_link_session_id IS NOT NULL;
