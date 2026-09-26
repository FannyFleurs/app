# API publique — Cartes cadeaux en ligne

> Statut : étape 3/N. `GET /config` (étape 2) ne fait que lire la
> configuration. `POST /checkout` (étape 3, ci-dessous) crée une session de
> paiement Stripe — **mais aucune carte cadeau n'est créée par cette route,
> à aucun moment.** Ni la création de la session, ni le navigateur atteignant
> la page de succès, ni rien d'observable côté client ne fait foi : seul un
> futur webhook Stripe signé (étape 4), après confirmation serveur-à-serveur
> du paiement, aura le droit de faire émettre une carte (via
> `GiftCardService`, non modifié par cette étape). Voir
> `lib/settings/online-gift-cards.ts` pour la configuration côté admin
> (Paramètres → Cartes cadeaux en ligne).

## `GET /api/public/gift-cards/config?key=hp_gc_...`

Contrat destiné aux sites publics d'organisations clientes (ex.
fanny-fleurs.com, plante-verte.fr) : il leur permet de savoir si la vente de
cartes cadeaux HelloPos est disponible, sous quel nom l'afficher, et avec
quels montants — avant de construire une page de vente.

### Authentification

**Aucune session HelloPos.** L'organisation concernée est déterminée
**exclusivement** par le paramètre `key` : la clé publique d'intégration
générée dans Paramètres → Cartes cadeaux en ligne (format `hp_gc_...`).

Il n'existe **aucun moyen** de désigner une organisation par son
`organization_id` — ni en paramètre, ni en en-tête. Fournir un `organization_id`
n'a aucun effet : seule la clé compte.

### `key` est PUBLIQUE, pas un secret

Cette clé identifie une intégration, elle ne l'authentifie pas. Elle peut
apparaître dans le code source d'un site public (JS front, HTML) sans risque
particulier : la connaître ne permet de lire que les informations publiques
ci-dessous (nom de l'organisation, montants proposés), rien de plus.

**Aucun paiement ne doit être considéré comme légitime au seul motif que cette
clé a été fournie.** Une étape ultérieure (création de paiement / carte
cadeau) devra appliquer ses propres protections côté serveur — cette clé n'en
tient pas lieu.

### Réponse — succès (`200`)

```json
{
  "enabled": true,
  "organization": {
    "name": "Plante Verte"
  },
  "gift_cards": {
    "preset_amounts": [25, 50, 75, 100],
    "allow_custom_amount": true,
    "min_amount": 10,
    "max_amount": 500
  }
}
```

Rien d'autre n'est jamais exposé : ni `organization_id`, ni `store_id`, ni
aucune information Stripe, ni aucun réglage interne HelloPos. Le contrat
reste volontairement minimal et générique — il doit pouvoir servir n'importe
quelle organisation cliente sans changement.

### Réponse — indisponible (`404`)

```json
{ "error": "GIFT_CARDS_NOT_AVAILABLE" }
```

Cette réponse (même statut, même corps) couvre **indifféremment** :
- une clé qui n'existe pas ;
- une clé malformée ;
- une intégration désactivée par l'organisation ;
- une organisation introuvable ou inactive.

C'est volontaire : distinguer ces cas publiquement permettrait à quiconque de
deviner qu'une clé « existe mais est désactivée », ou d'énumérer des
organisations par essais successifs. Un intégrateur qui voit `404` doit
simplement masquer le module d'achat de cartes cadeaux sur son site.

### CORS

`allowed_origins` (configuré dans Paramètres → Cartes cadeaux en ligne) est
une **protection navigateur**, pas un mécanisme d'authentification — la clé
elle-même est déjà publique.

- Requête avec en-tête `Origin` présent dans `allowed_origins` de
  l'organisation résolue : la réponse porte
  `Access-Control-Allow-Origin: <cette origine exacte>` (jamais `*`).
- Requête avec un `Origin` absent de cette liste (ou organisation non résolue
  — clé inconnue/désactivée) : aucun en-tête CORS. Le corps de la réponse est
  quand même renvoyé côté réseau, mais un navigateur bloquera sa lecture côté
  JavaScript, comme prévu par CORS.
- **Requête sans en-tête `Origin` du tout** (curl, appel serveur à serveur,
  SSR) : traitée normalement, réponse complète, sans en-tête CORS (inutile
  hors contexte navigateur). Choix assumé : cette route ne renvoie que des
  données publiques non sensibles, il n'y a pas de raison de l'exiger.
- `OPTIONS` est géré par robustesse (mêmes règles), même si un `GET` simple
  avec un seul paramètre de requête ne déclenche généralement pas de
  préflight côté navigateur.

### Exemple d'appel

```js
const res = await fetch(
  'https://app.hellopos.fr/api/public/gift-cards/config?key=hp_gc_xxxxxxxxxxxxxxxxx',
);
if (!res.ok) {
  // 404 : masquer le module d'achat de cartes cadeaux.
} else {
  const { organization, gift_cards } = await res.json();
  // organization.name, gift_cards.preset_amounts, etc.
}
```

## `POST /api/public/gift-cards/checkout`

Crée une Stripe Checkout Session pour l'achat d'une carte cadeau, en
utilisant le compte Stripe **propre à l'organisation** résolue par `key`
(celui déjà connecté dans Paramètres → Stripe — jamais un Stripe global aux
cartes cadeaux, jamais choisi par l'appelant).

**Checkout créé ≠ carte cadeau émise.** Cette route trace la tentative
(`online_gift_card_orders`, statut `pending`) et renvoie une URL Stripe.
Rien de plus. La carte n'existe qu'après confirmation du paiement par le
webhook Stripe de l'étape 4 (à venir) — jamais avant.

### Authentification et Origin

Comme `/config` : aucune session HelloPos, organisation déterminée
exclusivement par `key`. **Différence importante : l'en-tête `Origin` est
OBLIGATOIRE ici** (contrairement à `/config`, qui l'accepte absent). Cette
route construit des URLs de redirection (`success_path`/`cancel_path`
ci-dessous) : sans une origine autorisée et vérifiée, il n'y a pas de base
sûre pour les construire.

- `Origin` absent, ou absent de `allowed_origins` de l'organisation résolue
  ⇒ `403 { "error": "ORIGIN_NOT_ALLOWED" }`, aucune session créée.
- `Origin` autorisé ⇒ la réponse (succès ou erreur suivante) porte
  `Access-Control-Allow-Origin: <cette origine exacte>` (jamais `*`).
- `OPTIONS` (préflight CORS) : un préflight n'a **jamais de corps** — la clé
  `key` n'y est donc pas lisible, impossible d'y résoudre l'organisation ni
  ses origines autorisées. La réponse à `OPTIONS` est donc volontairement
  permissive (elle échoue l'`Origin` fourni, quel qu'il soit) : elle ne fait
  qu'autoriser le navigateur à envoyer le POST réel, qui SEUL applique la
  vérification stricte et décide d'ajouter ou non l'en-tête CORS à sa
  réponse. Un préflight ne renvoie aucune donnée — être permissif à ce
  niveau ne fuit rien.

### Payload

```json
{
  "key": "hp_gc_xxxxxxxxx",
  "amount": 50,
  "buyer": { "name": "Jean Dupont", "email": "jean@example.fr" },
  "recipient": { "name": "Marie Dupont", "email": "marie@example.fr" },
  "message": "Joyeux anniversaire !",
  "success_path": "/carte-cadeau/succes",
  "cancel_path": "/carte-cadeau",
  "idempotency_key": "client-généré-opaque"
}
```

| Champ | Obligatoire | Règles |
|---|---|---|
| `key` | oui | `hp_gc_...` |
| `amount` | oui | Nombre fini, en EUROS (`50`, `25.5`) — voir validation ci-dessous |
| `buyer.name` / `buyer.email` | oui | Chaîne, email plausible ; `buyer.email` sert d'email de paiement Stripe |
| `recipient.name` / `recipient.email` | oui | Chaîne, email plausible ; peut être identique à `buyer` (achat pour soi-même) |
| `message` | non | ≤ 500 caractères |
| `success_path` / `cancel_path` | non | Chemin relatif (`/...`) — voir « URLs de retour » ; défaut `/carte-cadeau/succes` et `/carte-cadeau` |
| `idempotency_key` | non | `[A-Za-z0-9_-]{8,100}` — voir « Idempotence » |

Le schéma est **strict** : tout champ non listé ici (`organization_id`,
`store_id`, `price_id`, `product_id`, `stripe_account`, `metadata`, un
montant Stripe brut…) fait rejeter toute la requête (`422`), il n'est
jamais silencieusement ignoré.

### Validation du montant

Le navigateur ne décide jamais seul d'un montant. Le serveur revérifie
contre la configuration de l'organisation (`GET /config`) :
- un montant de `preset_amounts` est **toujours** valide ;
- sinon, valide seulement si `allow_custom_amount` est vrai ET que le
  montant est compris entre `min_amount` et `max_amount`.

Le montant est ensuite converti en **centimes entiers** (`eurosToCents`,
`lib/services/money.ts`) avant tout envoi à Stripe — jamais de flottant.
Rejeté (`422 INVALID_AMOUNT`) : hors bornes/preset, NaN, Infinity, négatif
ou nul, plus de 2 décimales.

### URLs de retour (`success_path` / `cancel_path`)

Le navigateur ne fournit **jamais** l'origine de la redirection — seulement,
optionnellement, un **chemin relatif strictement validé** sur celle déjà
vérifiée (`Origin` ∈ `allowed_origins`). Le serveur reconstruit lui-même
`origineValidée + chemin`.

Accepté : un chemin commençant par `/`, sans `://`, sans `//` en tête, sans
`?`/`&`/`=` (la requête de retour Stripe, `?session_id=...`, est ajoutée par
le serveur uniquement sur `success_path`, jamais par l'appelant).

Refusé (`422 INVALID_RETURN_PATH`), sans exception : une URL absolue
(`https://...`), un chemin protocole-relatif (`//evil.com`), toute tentative
de changer d'origine.

Absents : `/carte-cadeau/succes` (succès) et `/carte-cadeau` (annulation)
par défaut.

### Réponse — succès (`200`)

```json
{
  "checkout_url": "https://checkout.stripe.com/pay/cs_test_...",
  "reference": "GC-A1B2C3D4"
}
```

Rien d'autre : ni `organization_id`, ni Stripe account, ni secret, ni
`payment_intent` client secret.

### Codes d'erreur

| Statut | `error` | Cas |
|---|---|---|
| 404 | `GIFT_CARDS_NOT_AVAILABLE` | Clé inconnue, malformée, ou intégration désactivée — **même réponse pour les trois**, comme `/config` |
| 403 | `ORIGIN_NOT_ALLOWED` | `Origin` absent ou non autorisé pour cette organisation |
| 422 | `VALIDATION_ERROR` | Forme du payload invalide (champ manquant, email invalide, message trop long, champ non documenté…) |
| 422 | `INVALID_AMOUNT` | Montant hors règles (voir ci-dessus) |
| 422 | `INVALID_RETURN_PATH` | `success_path`/`cancel_path` invalide |
| 429 | `RATE_LIMITED` | Trop de tentatives (voir « Anti-abus ») |
| 409 | `IDEMPOTENCY_KEY_CONFLICT` | `idempotency_key` déjà utilisée avec un contenu différent |
| 409 | `ORDER_ALREADY_COMPLETED` | `idempotency_key` d'une tentative qui n'est plus `pending` |
| 409 | `ORDER_EXPIRED_RETRY_WITH_NEW_KEY` | Rejeu idempotent dont la session Stripe n'est plus ouverte : réessayer avec une nouvelle `idempotency_key` |
| 503 | `PAYMENT_UNAVAILABLE` | Stripe non configuré/activé pour cette organisation |
| 502 | `CHECKOUT_UNAVAILABLE` | Stripe a refusé la création de la session (le message Stripe brut n'est **jamais** exposé publiquement — seulement journalisé serveur) |

### Anti-abus

Endpoint public créateur d'objets Stripe : limité par une fenêtre glissante
approximative, **persistée en base** (`online_gift_card_orders`, colonnes
`organization_id`/`client_ip`/`created_at`) — volontairement pas un compteur
en mémoire locale, inutilisable en environnement serverless multi-instance.
Par défaut : 30 tentatives/minute par organisation, 5/minute par IP
appelante. Voir `lib/services/online-gift-card-orders.ts::isRateLimited` —
isolé pour qu'un limiteur plus fin (seau à jetons persistant, ex.
Redis/Upstash) puisse le remplacer sans toucher à la route. Pas de captcha à
ce stade.

### Idempotence

`idempotency_key` (optionnelle, générée côté site appelant, opaque) évite
qu'un double-clic ou un retry réseau ne crée deux tentatives / deux sessions
Stripe :
- même clé + même contenu (montant, acheteur, bénéficiaire, message) rejoué
  ⇒ renvoie la **même** `checkout_url`/`reference` (aucune nouvelle session
  Stripe créée, sauf si l'ancienne n'est plus ouverte : voir
  `ORDER_EXPIRED_RETRY_WITH_NEW_KEY` ci-dessus) ;
- même clé + contenu **différent** ⇒ `409 IDEMPOTENCY_KEY_CONFLICT` ;
- scope : par organisation (`organization_id` + `idempotency_key`, contrainte
  UNIQUE en base — deux organisations peuvent recevoir la même clé sans
  collision).

En complément, un `Idempotency-Key` **Stripe** propre (dérivé de l'id
interne de la tentative) accompagne systématiquement l'appel à
`checkout.sessions.create` : protège contre un retry de NOTRE serveur vers
Stripe (timeout réseau…), indépendamment de toute clé fournie par le site
appelant.

**Limite assumée à ce stade** : le cas rare « rejeu idempotent alors que la
session Stripe précédente a expiré » ne réémet pas automatiquement une
session fraîche sur la même tentative — il redemande explicitement une
nouvelle `idempotency_key`. Documenté ici plutôt que résolu par une logique
de ré-émission plus complexe, hors du périmètre de cette étape.

### Exemple d'appel

```js
const res = await fetch('https://app.hellopos.fr/api/public/gift-cards/checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    key: 'hp_gc_xxxxxxxxxxxxxxxxx',
    amount: 50,
    buyer: { name: 'Jean Dupont', email: 'jean@example.fr' },
    recipient: { name: 'Marie Dupont', email: 'marie@example.fr' },
    message: 'Joyeux anniversaire !',
  }),
});
if (res.ok) {
  const { checkout_url } = await res.json();
  window.location.href = checkout_url; // redirige vers Stripe Checkout
}
```
