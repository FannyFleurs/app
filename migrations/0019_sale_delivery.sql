-- Permet d'attacher des infos retrait/livraison à une vente directement
-- (sans passer par une commande différée). Utilisé quand l'utilisateur
-- veut encaisser tout de suite mais marquer le ticket comme retrait
-- boutique ou livraison à date.
--
-- delivery_info JSONB structure :
-- {
--   pickup_or_delivery: 'pickup' | 'delivery',
--   requested_at: ISO timestamp,
--   slot_label: 'jeudi 15 janv. 14h00',
--   recipient_name, recipient_phone,
--   delivery_address: { line1, zip, city } | null,
--   internal_notes
-- }

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS delivery_info JSONB;

COMMENT ON COLUMN sales.delivery_info IS
  'Infos retrait/livraison saisies depuis OrderModal au moment de la vente. NULL = vente caisse simple.';
