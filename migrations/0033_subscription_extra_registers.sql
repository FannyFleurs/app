-- Migration 0033 : option "caisse supplémentaire" (add-on Stripe).
--
-- L'offre Essentiel (starter) est limitée à 1 caisse. Le client peut
-- souscrire des caisses supplémentaires à 9€/mois chacune. On stocke le
-- nombre d'add-ons achetés pour calculer la limite effective
-- (base + extra_registers) et le refléter dans l'abonnement Stripe.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS extra_registers INT NOT NULL DEFAULT 0;
