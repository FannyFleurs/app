# Intégration atelier externe (Supabase) — à développer plus tard

> Statut : **mémo de conception**, rien d'implémenté. Décision : à reprendre
> quand le besoin se confirme.

## Besoin
L'utilisateur conserve son application atelier actuelle (React + Supabase,
table `orders`) et souhaite que les commandes / livraisons saisies dans
HelloPos y soient **poussées automatiquement**, pour continuer à utiliser son
écran de préparation existant. (HelloPos a par ailleurs son propre écran
`/atelier` depuis la migration 0043.)

## Options étudiées

### A. Écriture directe dans Supabase (recommandée pour démarrer)
HelloPos insère/actualise directement la table `orders` du projet Supabase via
son API REST, à chaque création / modification / annulation.
- ✅ Zéro changement côté app existante.
- ⚠️ Clé service role Supabase à stocker chiffrée dans la config HelloPos
  (jamais côté front) ; couplage au schéma externe.

Mapping prévu :

| HelloPos | Table `orders` externe |
|---|---|
| pickup / delivery | `type` = commande / livraison |
| client / destinataire | `client_nom`, `customer_name` |
| requested_at + slot_label | `delivery_date`, `creneau` |
| lignes 1..4 | `prod1_description`, `prod1_montant`, `prod1_message`, … |
| boutique | `boutique_code` (alencon / mortagne / plante_verte…) |
| notes / message carte | `commentaire` |
| statut initial | `a_preparer` |

### B. Webhook sortant signé (cible propre à terme)
POST HMAC-signé vers une URL configurable (`order.created` / `order.updated` /
`order.cancelled`) + petite Edge Function Supabase côté utilisateur (~30
lignes, à fournir clé en main). Base de la future brique « intégrations ».

### C. API publique pull (écartée)
Clé API + `GET /api/public/orders` pollé par l'app externe — impliquerait de
modifier l'app existante, contraire à l'objectif.

## Sens de synchronisation
- V1 : **sens unique** HelloPos → Supabase (statuts préparée/livrée vivent
  dans l'app externe).
- Option ultérieure : retour de statut via trigger/webhook Supabase →
  HelloPos.

## Questions ouvertes (à trancher au moment du dev)
1. Option A ou B ; sens unique ou retour de statut.
2. URL du projet Supabase, nom exact de la table, codes boutiques attendus.
3. Périmètre : commandes différées seulement, ou aussi ventes caisse
   marquées retrait/livraison (delivery_info).
