-- Règlement par fidélité : la fidélité devient un MOYEN DE PAIEMENT (« Fidélité »)
-- au lieu d'une remise. On autorise donc la valeur 'loyalty' sur payments.method.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_method_check
  CHECK (method IN
    ('cash','card','check','transfer','gift_card','credit_note','deferred','other','payment_link','loyalty'));
