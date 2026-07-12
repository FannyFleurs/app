# Niveau 2 — Autonomie hors-ligne avec chaîne fiscale par poste

> Statut : **conception** (aucun code fiscal modifié à ce stade).
> Défauts retenus : numérotation **par poste**, scellement **hybride**.

## 1. Pourquoi ce chantier

Le Niveau 1 (déjà livré, flag `NEXT_PUBLIC_OFFLINE_POS`) encaisse hors-ligne
puis **scelle à la reprise réseau** : le ticket remis pendant la coupure est
*provisoire*. Le Niveau 2 vise l'**autonomie totale** : le poste scelle
**définitivement** hors-ligne, des heures durant, puis le serveur réconcilie.

## 2. Le verrou actuel

Aujourd'hui il existe **une seule chaîne fiscale par organisation**
(`fiscal_chain_state` : `next_index`, `last_hash`, `grand_total_ttc`, verrou
`FOR UPDATE`). Un poste hors-ligne **ne peut pas** avancer cette chaîne
partagée. Il faut donc **une chaîne par poste**.

## 3. Modèle cible

### 3.1 Chaîne par poste (register)
Nouvelle table `register_fiscal_chains` :

| colonne          | rôle                                             |
|------------------|--------------------------------------------------|
| register_id (PK) | le poste                                         |
| organization_id  | tenant                                           |
| next_index       | prochain index de CETTE chaîne (monotone/poste)  |
| last_hash        | dernier hash de CETTE chaîne                      |
| next_receipt_seq | prochaine séquence de ticket du poste             |
| year             | année courante (remise à 1 au changement d'année) |
| grand_total_ttc  | cumul perpétuel du poste                          |
| updated_at       |                                                  |

La chaîne globale par org reste en place (compat + agrégation) ; les chaînes
par poste sont la **source de vérité du scellement**.

### 3.2 Numérotation par poste
Format : `<code_poste>-<année>-<seq 6 chiffres>` (ex. `C1-2026-000045`).
Pas de collision entre postes, aucune coordination serveur nécessaire → un
ticket peut être **définitif** dès l'encaissement hors-ligne.

### 3.3 Scellement hybride (contrainte du web)
Un navigateur ne peut pas garder une **clé de signature inviolable**. Donc :
- **Hors-ligne, le poste garantit la CONTINUITÉ** : il calcule
  `index = last_index + 1` et `hash = SHA256(last_hash | index | type |
  payload_canonique)` à partir de son **état local** (miroir de
  `register_fiscal_chains`, persisté en IndexedDB).
- **À la réconciliation, le serveur ajoute la SIGNATURE** cryptographique
  (HMAC `FISCAL_SIGNING_KEY`, jamais exposée au client) et vérifie la chaîne.

> ⚠️ Conformité : ce mécanisme couvre les exigences techniques
> (inaltérabilité, chaînage, conservation). La **certification NF525** du
> système complet reste une démarche d'attestation/audit distincte, hors code.

## 4. Flux

### Encaissement hors-ligne (poste)
1. Lire l'état local de la chaîne du poste (index, hash, seq).
2. Calculer index + hash + numéro `<poste>-<année>-<seq>`.
3. Écrire le ticket **définitif** (snapshot figé) en IndexedDB + mettre à jour
   l'état local de la chaîne.
4. Empiler l'événement pour synchro.

### Réconciliation (reprise réseau)
1. Le poste envoie ses événements scellés **dans l'ordre** (index croissant).
2. Le serveur, pour ce poste :
   - vérifie `previous_hash == register_fiscal_chains.last_hash` et
     `index == next_index` (continuité stricte) ;
   - recalcule le hash et le compare (intégrité) ;
   - ajoute la **signature** serveur ;
   - insère la vente + le `fiscal_event` + avance `register_fiscal_chains` ;
   - avance aussi la chaîne d'org (agrégation) et le grand total.
3. Idempotent via `client_ref` (déjà en place, migration 0037).
4. En cas de rupture de chaîne détectée → **rejet + alerte** (pas d'import
   silencieux) : un événement fiscal d'anomalie est journalisé.

## 5. Découpage en étapes (chacune testable / réversible)

1. **Migration** `register_fiscal_chains` (additive, inerte). *(sûr)*
2. **Lib de chaînage** partagée client/serveur (hash déterministe déjà dans
   `lib/fiscal/hash.ts`) + tests unitaires du chaînage par poste. *(sûr)*
3. **État local du poste** (IndexedDB) + amorçage depuis le serveur à
   l'ouverture (dernier index/hash/seq connus). *(sûr)*
4. **Endpoint de réconciliation** `/api/fiscal/reconcile` (vérif continuité +
   signature + insertion), idempotent, gated flag. *(à tester en preview)*
5. **Bascule de l'encaissement** hors-ligne vers le scellement local définitif
   (remplace le ticket provisoire du Niveau 1). *(à tester en preview)*
6. **Vérificateur de chaîne par poste** dans `scripts/verify-fiscal-chain.ts`
   + page admin santé (continuité par poste). *(sûr)*

## 6. Points de vigilance
- **Concurrence** : 2 postes hors-ligne utilisant la même carte cadeau / le
  même avoir → conflit détecté à la réconciliation (solde négatif) → à
  arbitrer (refus + note, ou acceptation avec regularisation).
- **Changement d'année** hors-ligne : remise à 1 de la séquence par poste
  gérée localement (year dans l'état local).
- **Perte de l'appareil** avant synchro : les tickets locaux non synchronisés
  sont perdus → recommander une synchro fréquente + sauvegarde.
- **Flag** : tout le Niveau 2 reste derrière `NEXT_PUBLIC_OFFLINE_POS` (+ un
  sous-flag éventuel `OFFLINE_LEVEL2`) pour un déploiement progressif.
