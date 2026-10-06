-- Migration de DONNÉES (pas de changement de schéma) : corrige le solde en
-- compte d'OGF Services Financiers, abîmé par la migration 0088.
--
-- 0088 remettait ce solde à 0 (demande explicite de l'utilisateur, qui
-- affichait alors +160,80€ de façon erronée). Mais 0088 fixait une valeur
-- EN DUR, sans condition : si elle s'exécute (au déploiement suivant,
-- db:migrate) APRÈS qu'une nouvelle vente légitime en "Différé client" ait
-- été validée pour ce client, elle écrase ce nouveau débit avec 0 — ce qui
-- s'est produit : une vente "Différé client" de 303,20€ a été validée juste
-- après le déploiement, mais le solde en compte est resté à 0,00€ au lieu
-- de passer à -303,20€.
--
-- Corrigé en RECALCULANT le solde depuis la source de vérité (somme des
-- paiements method = 'deferred' des ventes VALIDÉES de ce client), plutôt
-- qu'en fixant à nouveau une valeur en dur — qui reproduirait exactement le
-- même risque si une autre vente survenait entre l'écriture de cette
-- migration et son exécution réelle en production. Les ventes annulées
-- passent à un autre statut (ex. cancelled_by_credit_note, voir
-- sale-cancel-service.ts) donc n'entrent pas dans la somme.
--
-- Ciblée au MAXIMUM (id + organization_id + company_name exacts), comme
-- 0088 : aucun effet sur un autre client ou une autre base.
UPDATE customers c
   SET account_balance = -(
         SELECT COALESCE(SUM(p.amount), 0)
           FROM payments p
           JOIN sales s ON s.id = p.sale_id
          WHERE p.method = 'deferred'
            AND s.customer_id = c.id
            AND s.organization_id = c.organization_id
            AND s.status = 'validated'
       ),
       updated_at = now()
 WHERE c.id = '7710ed3a-44a1-4661-a900-eef0a799f08d'
   AND c.organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb'
   AND c.company_name = 'OGF Services Financiers';
