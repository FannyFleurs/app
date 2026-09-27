# Multi-boutique : Stripe, cartes cadeaux en ligne, comptabilité

Ce document couvre l'évolution qui rend **Stripe** et **les cartes cadeaux
en ligne** configurables **par boutique** (au lieu d'un seul compte par
organisation), le **chiffrement au repos** des secrets Stripe, la
**correction comptable** carte cadeau (encaissement ≠ CA), et la **file
d'attente** qui rattache un encaissement web à la bonne session de caisse.

Pour le contrat API public (checkout, webhook, config), voir
`docs/api-public-gift-cards.md`. Ce document-ci couvre l'architecture
interne : stockage, sécurité, comptabilité.

## 1. Configuration par boutique — `scopedSettingKey`

`stripe` et `online_gift_cards` réutilisent le mécanisme **déjà existant**
de `lib/settings/scoped.ts` / `lib/settings/scoped-server.ts` (le même que
`cash`, `invoice`, `opening-float`, `printer`, `screen-delivery`, `email`) :
la table `settings` (PK `(organization_id, key)`, sans colonne `store_id`)
encode la boutique dans la clé elle-même :

- `stripe` / `online_gift_cards` → configuration **organisation** (repli,
  comportement historique avant cette évolution).
- `stripe:<storeId>` / `online_gift_cards:<storeId>` → configuration
  **propre à cette boutique**.

`loadStripeSettings(organizationId, storeId)` et
`loadOnlineGiftCards(organizationId, storeId)` lisent la clé de la boutique
si elle existe, sinon retombent sur la clé organisation — **jamais** sur la
clé d'une **autre** boutique. Une boutique sans configuration Stripe propre
ne reçoit donc jamais arbitrairement les identifiants d'une autre boutique.

```
Organisation Fanny Fleurs
├── Boutique Fanny Fleurs   → stripe:<store_ff>, online_gift_cards:<store_ff>
└── Boutique Plante Verte   → stripe:<store_pv>, online_gift_cards:<store_pv>
```

Aucun `store_id` n'est jamais accepté comme source de vérité depuis le
navigateur : côté public (checkout, config, widget), la boutique est
**résolue serveur** à partir de la clé publique `hp_gc_...`
(`resolveActiveOnlineGiftCards`) ; côté back-office, elle est vérifiée
contre l'organisation de l'appelant (`storeInOrg`) avant tout accès.

### 1 bis. Où Stripe se configure réellement dans l'interface

**Stripe se configure UNIQUEMENT dans Paramètres → Modes de règlement**
(`/settings/payment-methods`, `PaymentMethodsForm.tsx`) : la section
« Configuration Stripe » qui s'affiche dès qu'un mode de règlement
« Lien de paiement Stripe » est actif. C'est le seul écran Stripe qui
existe dans l'interface — il n'y a jamais eu, et il n'y a toujours pas,
d'entrée de menu séparée pour Stripe.

Une route `/settings/stripe` (page + formulaire dédiés) avait été créée par
erreur lors d'une évolution précédente de ce chantier, sans jamais être
reliée au menu ni à aucun lien de l'application (`app/(app)/settings/layout.tsx`
ne la référence pas) : son sélecteur de boutique n'était donc jamais visible
en pratique, pendant que l'écran réellement utilisé
(`/settings/payment-methods`) continuait d'appeler `/api/settings/stripe`
**sans** `store_id`, toujours au niveau organisation. Cette route orpheline
a été supprimée (pas de duplication d'interface) ; c'est désormais la
section Stripe de `/settings/payment-methods` qui porte le sélecteur de
boutique, exactement comme `/settings/email`.

L'API (`app/api/settings/stripe/route.ts`, `lib/settings/stripe-server.ts`)
n'a pas changé : elle acceptait déjà `store_id` et utilisait déjà
`scopedSettingKey` — seul le formulaire qui l'appelle ne le lui transmettait
pas.

### Migration de la configuration existante

- **`online_gift_cards`** : la configuration organisation existante,
  utilisée en pratique par le site Plante Verte, a été migrée vers la clé
  `online_gift_cards:<storeId>` de la boutique nommée exactement « Plante
  Verte » (migration `0084`), de façon **ciblée et idempotente** (n'agit
  que si l'organisation a À LA FOIS une config organisation ET une boutique
  « Plante Verte » ; ne fait jamais de suppositions sur un autre
  environnement).
- **`stripe`** : **jamais migré automatiquement**. Le compte Stripe
  actuellement configuré au niveau organisation peut appartenir à une
  boutique précise (ex. Fanny Fleurs) — le transférer arbitrairement vers
  une autre boutique serait une erreur silencieuse. Chaque boutique doit
  recevoir ses identifiants Stripe **explicitement**, depuis la section
  Stripe de `/settings/payment-methods` (« Modes de règlement », sélecteur
  de boutique — voir § 1 bis). Tant qu'une boutique n'a pas sa propre
  configuration, elle continue de retomber sur la configuration
  organisation existante (compatibilité préservée).

## 2. Chiffrement au repos des secrets Stripe

`lib/security/secret-crypto.ts` — AES-256-GCM via `node:crypto`
(`createCipheriv`/`createDecipheriv`), **aucune nouvelle dépendance**.

- Clé maître : variable d'environnement `SECRETS_ENCRYPTION_KEY` (256 bits,
  hex). **Jamais** stockée en base, **jamais** envoyée au navigateur,
  **jamais** journalisée.
- Format versionné : `enc:v1:<base64(iv[12] + tag[16] + ciphertext)>`.
- `encryptSecret(plaintext)` : si `SECRETS_ENCRYPTION_KEY` est absente,
  renvoie le texte **inchangé** (pas de régression avant que la variable
  soit déployée). Si elle est présente, chiffre.
- `decryptSecret(stored)` : une valeur qui ne porte pas le préfixe `enc:v1:`
  est traitée comme du **texte en clair historique**, renvoyée telle
  quelle — jamais rejetée. Une valeur chiffrée dont la clé maître est
  absente ou incorrecte lève `SecretCryptoError` ; `loadStripeSettings` la
  capture, journalise côté serveur uniquement, et renvoie un secret **vide**
  (`decryptionFailed: true`) plutôt qu'un secret erroné utilisable pour un
  appel Stripe.
- Masquage UI : `secret_key`/`webhook_secret` ne sont **jamais** renvoyés en
  clair au navigateur après enregistrement (`maskKey`, `*_set` booléens).

### Variable Vercel à ajouter et ordre de déploiement

1. **Générer** la clé : `openssl rand -hex 32`.
2. **Ajouter** `SECRETS_ENCRYPTION_KEY=<valeur>` dans Vercel (Production +
   Preview), **avant ou pendant** le déploiement de ce code — sans
   condition d'ordre stricte : en son absence, tout continue de fonctionner
   en clair (comportement identique à avant), aucune casse.
3. **Après** le déploiement (variable présente) : toute **nouvelle**
   écriture Stripe (`saveStripeSettings`, donc tout enregistrement depuis
   section Stripe de `/settings/payment-methods`) est automatiquement chiffrée. Les secrets déjà en
   base **avant** ce déploiement restent en clair jusqu'à leur **prochaine
   modification** (migration paresseuse, pas de script de migration en
   masse qui manipulerait des secrets en production) — ils restent lisibles
   dans l'intervalle (`decryptSecret` tolère le texte en clair).
4. Pour forcer le chiffrement d'un secret existant sans le changer :
   ré-enregistrer la même valeur depuis la section Stripe de `/settings/payment-methods` une fois la
   variable en place.

Ne jamais supprimer la tolérance au texte en clair dans `decryptSecret`
tant qu'il subsiste des secrets non ré-enregistrés depuis l'activation de
la clé — c'est la garantie de compatibilité descendante de ce mécanisme.

## 3. Comptabilité : encaissement ≠ chiffre d'affaires

**Défaut corrigé** : avant cette évolution, l'émission d'une carte cadeau
(en caisse) était comptée comme du CA (`sales.total_ttc`), ET la vente
réglée plus tard **avec** cette carte était **elle aussi** comptée comme du
CA — la même somme comptée deux fois.

**Principe appliqué (identique caisse et en ligne)** :

```
Émission carte cadeau 50 €     → encaissement +50 €   → CA +0 €
Achat produits 50 €, payé par
la carte                        → CA +50 €             → paiement « carte cadeau »
──────────────────────────────────────────────────────────────────
Résultat : 50 € de CA (pas 100 €)
```

### Ce qui a changé, précisément

- `SaleService.validate()` : au moment de l'émission d'une carte
  cadeau/bon d'achat (bloc déjà existant, création atomique
  `gift_cards` + `gift_card_movements('issue')`, **inchangé**), la ligne de
  vente correspondante reçoit un marqueur persistant
  `sale_lines.metadata.gift_card_ca_deferred = true` — posé par une
  `UPDATE` explicite, **avant** que la vente ne passe `status = 'validated'`
  (le scellement fiscal et le hash n'en sont donc jamais affectés).
  `sales.total_ht/tva/ttc` (déjà figés plus haut dans le même service, et
  utilisés pour la réconciliation caisse/paiements réels) **ne sont jamais
  modifiés** — seule la classification "CA" du reporting change.
- Les agrégations de CA (`ClosingService.sealDaily`, `computeDayReport`,
  `/api/ca/summary`) sourcent désormais leurs totaux depuis `sale_lines`
  (comme le fait déjà de longue date la répartition TVA), en **excluant**
  les lignes `gift_card_ca_deferred = true`. `cash_expected` (réconciliation
  du tiroir) reste basé sur les `payments` réels, **inchangé** : l'argent
  réellement encaissé à l'émission continue d'apparaître dans la caisse.
- Une **nouvelle** section `encaissements_hors_ca` (Z, X, et rapport de
  clôture) distingue explicitement la vente de cartes cadeaux (caisse) et
  les cartes cadeaux en ligne/Stripe — hors CA par construction. Le
  paiement **par** carte cadeau à l'usage reste visible séparément dans
  `payments_breakdown` (`method = 'gift_card'`).
- **Non-rétroactivité stricte** : `gift_card_ca_deferred` n'est posé que par
  les émissions **postérieures** au déploiement. Une vente historique déjà
  validée n'est **jamais** recalculée ni modifiée — elle continue de compter
  en CA exactement comme avant.
- Pour une carte cadeau achetée **en ligne**, aucune `sales`/`sale_lines`
  n'existe (le flux en ligne n'a jamais créé de vente HelloPos) : la
  question du double comptage ne se pose pas de ce côté — l'émission en
  ligne était, et reste, un encaissement (voir § 4) sans effet sur le CA.

### Limite connue (documentée, pas corrigée dans cette évolution)

Les ventilations `by_vendor`, `by_category` (partiellement corrigée) et
`by_mode` de `computeDayReport` ne sont pas toutes ré-attribuées avec la
même granularité que les totaux CA — une carte cadeau émise dans un panier
mixte peut encore apparaître dans `by_vendor`/`by_mode` alors qu'elle est
exclue du total CA. Correction possible dans une évolution ultérieure si
besoin (nécessite d'attribuer la portion « hors carte cadeau » d'une vente
mixte, panier par panier).

## 4. File d'attente des encaissements externes — `pending_store_operations`

Un paiement Stripe (carte cadeau en ligne) peut arriver **hors** du cycle
caisse habituel — boutique fermée, aucune session de caisse ouverte. Deux
notions sont distinguées :

1. **`occurred_at`** : l'instant **réel** de l'encaissement (celui de
   l'événement Stripe, `event.created` — jamais l'heure de traitement du
   webhook). **Jamais modifié**, y compris lors d'un rattachement différé.
2. **`cash_session_id`** : la session de caisse à laquelle l'opération est
   **finalement** rattachée pour apparaître dans les rapports — immédiat si
   une session est déjà ouverte, différé sinon.

`pending_store_operations` (migration `0086`) est une table **générique**
(`kind` extensible ; aujourd'hui une seule valeur `online_gift_card`, pas
sur-conçue au-delà du besoin actuel), append-only (suppression bloquée par
trigger) :

- `createPendingStoreOperation` (appelé par
  `fulfillOnlineGiftCardCheckout` après émission réussie de la carte) :
  résout la session ouverte de la boutique au moment de l'appel. Si elle
  existe → rattachement **immédiat**. Sinon → `cash_session_id = NULL`
  (« en attente »). Idempotent (`UNIQUE(source_type, source_id)`) : un
  webhook rejoué ne crée jamais une seconde ligne.
- `assignPendingStoreOperations` (appelé par `CashSessionService.open`,
  **dans la même transaction** que l'ouverture) : à l'ouverture suivante
  d'une session pour cette boutique, rattache automatiquement toute
  opération encore en attente — sans jamais toucher `occurred_at`, et sans
  jamais modifier une clôture déjà scellée (l'affectation ne vise qu'une
  session `status = 'open'`).

## 5. Webhook Stripe multi-comptes

Une organisation peut désormais avoir **plusieurs** comptes Stripe (un par
boutique), donc potentiellement plusieurs secrets de webhook valides pour
une même organisation. `app/api/webhooks/stripe/route.ts` (chemin carte
cadeau en ligne, `handleGiftCardWebhook`) résout le compte **attendu**
ainsi, dans cet ordre strict :

1. Relit la commande **persistée** (`online_gift_card_orders`) par son id
   (`gift_card_order_id`, tiré de la metadata) — **jamais** la metadata
   elle-même. `organization_id`/`store_id` de cette ligne, posés au moment
   du checkout par le serveur (jamais par le navigateur), sont la **seule**
   source de vérité.
2. Si l'`organization_id` de la metadata reçue ne correspond pas à celui de
   la commande réellement enregistrée → ignoré, **avant** toute tentative
   de vérification de signature.
3. Charge le compte Stripe de la **boutique réelle** de cette commande
   (`loadStripeSettings(organization_id, store_id)` — repli organisation si
   commande antérieure au multi-boutique) et vérifie la signature HMAC avec
   **ce** secret précis.

Une metadata `store_id` seule n'est **jamais** une preuve : c'est
l'étape 3, cryptographique, qui garantit qu'un événement du compte Stripe
d'une boutique A ne peut jamais valider la commande d'une boutique B —
chaque compte Stripe a son propre secret de signature, et seul celui de la
boutique réellement associée à la commande peut produire une signature
valide pour elle. Voir `tests/webhook-stripe-gift-cards.test.ts`, section
« isolation multi-comptes », pour les scénarios vérifiés.

L'idempotence existante (verrouillage de ligne + statut non-`'pending'`
dans `fulfillOnlineGiftCardCheckout`) est inchangée.

## 6. Tests

- `tests/gift-card-accounting.test.ts` — intégration contre une **vraie**
  base Postgres (`DATABASE_URL`) : scénario bout-en-bout complet (émission
  50 €, CA=0, utilisation, CA=50, pas de double comptage), clôture Z, file
  d'attente (session ouverte/fermée, affectation à l'ouverture suivante,
  `occurred_at` préservé, clôture scellée non modifiée).
- `tests/multi-store-stripe-integration.test.ts` — intégration DB : deux
  boutiques/deux comptes Stripe isolés, repli organisation (jamais une
  autre boutique), chiffrement au repos vérifié sur la ligne brute,
  cartes cadeaux en ligne par boutique, widget affichant le bon nom de
  boutique, cycle complet checkout → webhook → carte émise → file
  d'attente → session ouverte.
- `tests/webhook-stripe-gift-cards.test.ts` — isolation cryptographique
  multi-comptes (mocké, teste la route HTTP/signature).
- `tests/secret-crypto.test.ts` — chiffrement (round-trip, tolérance au
  texte en clair, rejet des données corrompues/mauvaise clé).

Ces deux premiers fichiers sont **ignorés silencieusement** si
`DATABASE_URL` n'est pas définie (`describe.skipIf`) — jamais un échec de
`npm test` en environnement sans Postgres. Pour les exécuter :

```bash
createdb webpos_test   # ou toute base vide
DATABASE_URL=postgres://user:pass@localhost:5432/webpos_test npm run db:migrate
DATABASE_URL=postgres://user:pass@localhost:5432/webpos_test npm test
```

## 7. Liens de paiement (ventes/commandes) — également store-scoped

`app/api/sales/[id]/payment-link/route.ts` et
`app/api/orders/[id]/payment-link/route.ts` résolvent désormais Stripe via
`loadStripeSettings(organizationId, storeId)`, avec le `store_id` **réel**
de la vente/commande (jamais fourni par l'appelant) — même mécanisme que le
checkout de cartes cadeaux. Un client de Plante Verte paie donc toujours via
le compte Stripe Plante Verte, jamais celui de Fanny Fleurs, et inversement.

Le webhook (`app/api/webhooks/stripe/route.ts`, `handleSaleOrOrderWebhook`)
applique la même résolution de confiance que pour les cartes cadeaux : il
relit la vente/commande **persistée** par son id pour connaître sa boutique
réelle, recoupe l'`organization_id` de la metadata, puis vérifie la
signature avec le secret de **cette** boutique précise — jamais celui d'une
autre. Un événement du compte Plante Verte ne peut donc jamais valider une
vente/commande de Fanny Fleurs, et inversement.

## 8. Suivi / recommandations non traitées ici

- Ventilations `by_vendor`/`by_mode` de `computeDayReport` : voir § 3,
  limite connue.
- `payment_intent.payment_failed` reste actuellement inerte pour les deux
  flux (cartes cadeaux et liens de paiement) : aucun des créateurs de
  Checkout Session ne pose `payment_intent_data[metadata]`, donc l'objet
  PaymentIntent reçu par le webhook pour cet événement n'a pas de metadata
  exploitable (voir l'audit détaillé du webhook). Sans effet pratique
  aujourd'hui ; à corriger si ce cas devient nécessaire.
