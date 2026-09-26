-- Distribution de la carte cadeau après émission (étape 5 de l'intégration
-- "Cartes cadeaux en ligne"). Distingue désormais trois rôles :
--   - buyer     : paie la commande (inchangé depuis l'étape 3) ;
--   - recipient : titulaire de la carte (inchangé depuis l'étape 4) ;
--   - destinataire de l'EMAIL contenant la carte : dépend de delivery_mode,
--     ci-dessous, et peut différer du recipient.
--
-- recipient_email devient FACULTATIF : un achat en mode 'buyer' (carte
-- imprimée/remise en main propre par l'acheteur) n'a besoin d'aucune
-- adresse email du bénéficiaire. Une contrainte CHECK impose qu'elle reste
-- renseignée en mode 'recipient' (obligatoire pour recevoir la carte) —
-- jamais de valeur vide/fictive utilisée pour contourner l'ancienne
-- contrainte NOT NULL.
ALTER TABLE online_gift_card_orders
  ALTER COLUMN recipient_email DROP NOT NULL;

ALTER TABLE online_gift_card_orders
  ADD COLUMN delivery_mode TEXT NOT NULL DEFAULT 'buyer'
    CHECK (delivery_mode IN ('buyer', 'recipient'));

ALTER TABLE online_gift_card_orders
  ADD CONSTRAINT online_gift_card_orders_recipient_email_required_ck
    CHECK (delivery_mode <> 'recipient' OR recipient_email IS NOT NULL);

-- Suivi de la DISTRIBUTION (email), volontairement DISTINCT du statut de la
-- commande (`status`) : une commande peut être 'issued' (paiement confirmé,
-- carte déjà créée) alors que sa distribution est encore 'pending'/'sending'
-- ou a échoué ('failed') — un échec d'envoi ne doit jamais remettre en
-- cause le paiement ni la carte déjà émise.
-- 'sending' est un état transitoire qui sert de verrou d'unicité applicatif
-- (voir lib/services/online-gift-card-delivery.ts) : seule une ligne encore
-- 'pending' ou 'failed' est réclamable, jamais 'sending'/'sent' — ce qui
-- évite un double envoi en cas de rejeu webhook concurrent, sans tenir un
-- verrou Postgres pendant tout l'appel réseau au fournisseur d'email.
-- 'failed' reste réclamable par un futur essai (rejeu webhook, ou plus tard
-- un bouton « Renvoyer la carte cadeau », non construit à cette étape).
ALTER TABLE online_gift_card_orders
  ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sending', 'sent', 'failed')),
  ADD COLUMN delivery_attempted_at TIMESTAMPTZ,
  ADD COLUMN delivery_sent_at TIMESTAMPTZ,
  -- Code d'erreur COURT uniquement (ex. 'PROVIDER_ERROR') : jamais de détail
  -- technique/sensible ici, qui reste dans les logs serveur (console.error).
  ADD COLUMN delivery_error TEXT;

-- Rétrocompatibilité : les commandes déjà émises AVANT cette étape (statut
-- déjà 'issued') n'ont jamais eu de distribution email à faire — on les
-- marque directement 'sent' pour qu'un rejeu tardif d'un webhook Stripe
-- (dashboard « renvoyer l'événement », plusieurs mois après) ne déclenche
-- pas rétroactivement un email inattendu pour ces anciennes commandes.
UPDATE online_gift_card_orders SET delivery_status = 'sent' WHERE status = 'issued';
