-- Migration de DONNÉES (pas de changement de schéma) : remet à 0 le solde
-- en compte (account_balance) du client "OGF Services Financiers" de
-- l'organisation Fanny Fleurs — confirmé explicitement par l'utilisateur :
-- ce client affichait un solde de +160,80€ alors qu'il devrait être à 0 à
-- ce stade. Correction directe demandée, sans événement fiscal associé.
--
-- Ciblée au MAXIMUM pour ne jamais affecter un autre client ou une autre
-- organisation par coïncidence : id ET organization_id ET company_name
-- doivent correspondre EXACTEMENT au client identifié. Toute autre base
-- (dev/staging, ou si cet enregistrement a changé) ne voit aucune ligne
-- affectée — pas d'erreur, pas d'effet de bord.
--
-- Idempotente : une seconde exécution ne change plus rien (déjà à 0).
UPDATE customers
   SET account_balance = 0,
       updated_at = now()
 WHERE id = '7710ed3a-44a1-4661-a900-eef0a799f08d'
   AND organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb'
   AND company_name = 'OGF Services Financiers';
