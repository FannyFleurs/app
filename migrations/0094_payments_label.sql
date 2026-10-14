-- Libellé du mode de règlement, figé au moment du paiement (même logique
-- que sale_lines.label : un renommage ou une suppression ultérieure du
-- mode de règlement personnalisé ne doit jamais corrompre l'historique).
--
-- Sans ça, deux modes personnalisés de même "kind" (ex. "Carte Vitrine" et
-- "Paiement Web", tous deux kind='other') sont indiscernables après coup :
-- seule la catégorie technique générique est conservée, et tout retombe
-- sur "Autre" partout où le mode de règlement est affiché.
--
-- NULL pour les lignes déjà enregistrées : cette information n'a jamais été
-- capturée, impossible de la reconstituer. Chaque écran qui affiche le
-- libellé doit retomber sur la catégorie générique (PAYMENT_LABELS[method])
-- quand label est NULL.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE account_settlement_payments ADD COLUMN IF NOT EXISTS label TEXT;
