-- Migration 0042 : autorise le mode de règlement 'payment_link' dans payments.
-- Le mode existait déjà côté payment_methods (0027) et l'UI l'affiche, mais la
-- contrainte CHECK de la table payments le refusait → toute vente réglée par
-- lien de paiement Stripe échouait à la validation. On aligne la contrainte.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'payments_method_check'
       AND conrelid = 'payments'::regclass
  ) THEN
    ALTER TABLE payments DROP CONSTRAINT payments_method_check;
  END IF;
END$$;

ALTER TABLE payments
  ADD CONSTRAINT payments_method_check
  CHECK (method IN
    ('cash','card','check','transfer','gift_card','credit_note','deferred','other','payment_link'));
