-- Migration 0027 : ajout de 'payment_link' comme kind valide dans
-- payment_methods. La migration initiale (0005) avait un CHECK qui
-- interdisait ce kind, donc toute tentative de creer un mode "Lien de
-- paiement Stripe" plantait silencieusement (erreur 500 cote API,
-- rien enregistre cote UI) et empechait aussi l'auto-seed du mode
-- payment_link, ce qui privait l'utilisateur de la config Stripe
-- (qui n'apparait que si le mode payment_link est actif).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'payment_methods_kind_check'
       AND conrelid = 'payment_methods'::regclass
  ) THEN
    ALTER TABLE payment_methods
      DROP CONSTRAINT payment_methods_kind_check;
  END IF;
END $$;

ALTER TABLE payment_methods
  ADD CONSTRAINT payment_methods_kind_check
  CHECK (kind IN (
    'cash','card','check','transfer',
    'gift_card','credit_note','payment_link','deferred','other'
  ));
