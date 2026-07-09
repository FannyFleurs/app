-- Migration 0030 : facturation SaaS (Stripe) + gate d'onboarding.
--
-- onboarding_complete : une organisation creee via /setup avec paiement
-- Stripe reste "incomplete" (FALSE) tant que le Checkout n'est pas
-- valide (carte saisie). L'acces a l'app est bloque tant que FALSE.
-- Les organisations existantes passent a TRUE (aucun impact).
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT TRUE;

-- Reference du client Stripe (distinct de la subscription id qui va
-- dans subscriptions.external_ref).
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Autorise le statut 'trialing' et 'incomplete' pour refleter Stripe.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'subscriptions_status_check'
       AND conrelid = 'subscriptions'::regclass
  ) THEN
    ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_status_check;
  END IF;
END $$;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active','trialing','incomplete','past_due','cancelled','expired'));
