# Widget public — Vente de cartes cadeaux HelloPos

> Étape 6/N de l'intégration « Cartes cadeaux en ligne ». Ce document
> explique comment un site tiers (WordPress, site HTML statique, React,
> autre CMS…) intègre le widget public de vente de cartes cadeaux HelloPos.
> Pour le contrat des API consommées par ce widget (`GET /config`,
> `POST /checkout`), voir `docs/api-public-gift-cards.md` — ce document-ci
> ne le duplique pas.

## 1. Activer les cartes cadeaux en ligne

Dans HelloPos : **Paramètres → Cartes cadeaux en ligne**.

- Activer l'intégration.
- Définir les montants proposés, le montant libre (min/max).
- Noter la **clé publique** générée automatiquement (`hp_gc_...`).

## 2. Ajouter le domaine du site à `allowed_origins`

Toujours dans **Paramètres → Cartes cadeaux en ligne**, ajouter l'origine
exacte du site qui doit pouvoir vendre des cartes (ex. `https://www.mon-site.fr`).
Sans cette étape, le navigateur du visiteur ne pourra jamais lire les
réponses de l'API (voir § 9, « Origin / CORS »).

Pour tester en local : ajouter `http://localhost:PORT` (le protocole
`http://` n'est toléré que pour `localhost`/`127.0.0.1`).

## 3. Récupérer la `public_key`

La clé `hp_gc_...` affichée à l'étape 1. Ce n'est **pas un secret** — elle
identifie l'intégration publiquement, elle ne l'authentifie pas (voir
`docs/api-public-gift-cards.md`).

## 4. Intégrer le widget

```html
<hellopos-gift-card data-key="hp_gc_xxxxxxxxxxxxxxxxxxxxxxxxxxx"></hellopos-gift-card>
<script src="https://hellopos.fr/gift-cards/widget/v1/embed.js" async></script>
```

C'est tout : un élément HTML personnalisé (`<hellopos-gift-card>`) et un
script. Aucune installation, aucune dépendance, aucun compte HelloPos côté
site intégrateur.

### Pourquoi un élément personnalisé plutôt que `<div id="…">` + script ?

L'énoncé initial envisageait `<div id="hellopos-gift-card"></div>` +
`<script data-key="…">`. Après analyse de l'architecture existante
(voir § 12, « Choix d'architecture »), un **élément personnalisé
(Web Component) avec Shadow DOM** a été retenu à la place :

- il isole totalement le CSS du widget de celui du site hôte, et
  réciproquement — voir § 8 ;
- il n'a besoin d'aucun `id` (donc aucun risque de collision, et plusieurs
  cartes cadeaux peuvent être affichées sur une même page sans conflit) ;
- il se redimensionne naturellement avec son contenu (pas d'iframe, donc
  pas de problème de hauteur/scroll à gérer côté HelloPos ou côté site) ;
- il reste tout aussi simple à poser qu'un `<div>` + `<script>`.

L'intégration reste conforme à l'esprit de la demande : un conteneur, la
clé publique, et rien d'autre d'obligatoire.

## 5. Options disponibles sur `<hellopos-gift-card>`

| Attribut | Obligatoire | Rôle |
|---|---|---|
| `data-key` | **oui** | Clé publique `hp_gc_...` |
| `data-success-path` | non | Chemin relatif de retour après paiement réussi (défaut backend : `/carte-cadeau/succes`) |
| `data-cancel-path` | non | Chemin relatif de retour après annulation (défaut backend : `/carte-cadeau`) |
| `data-primary-color` | non | Couleur d'accent (hex ou nom CSS simple) — **purement visuel** |
| `data-text-color` | non | Couleur de texte principale — **purement visuel** |
| `data-radius` | non | Rayon des coins (ex. `12px`) — **purement visuel** |

Aucune de ces options ne peut jamais influencer `organization_id`, un
montant, la configuration Stripe, la sécurité ou `delivery_mode` côté
serveur — ce sont de simples variables CSS posées sur l'élément hôte.

`data-success-path`/`data-cancel-path` doivent être des chemins **relatifs**
(`/...`) sur le site intégrateur. Une valeur absolue (`https://...`) ou
protocole-relative (`//...`) est **ignorée côté widget** (le défaut du
backend s'applique alors) — le backend la rejetterait de toute façon
(`422 INVALID_RETURN_PATH`, voir `docs/api-public-gift-cards.md`), le
widget évite simplement l'aller-retour inutile.

### Exemple complet avec options

```html
<hellopos-gift-card
  data-key="hp_gc_xxxxxxxxxxxxxxxxxxxxxxxxxxx"
  data-success-path="/carte-cadeau/succes"
  data-cancel-path="/carte-cadeau"
  data-primary-color="#7A3C6E"
  data-radius="10px"
></hellopos-gift-card>
<script src="https://hellopos.fr/gift-cards/widget/v1/embed.js" async></script>
```

## 6. Comportement responsive

Le widget n'utilise **aucune iframe** : il s'insère directement dans le
flux du document (à l'intérieur d'un Shadow DOM), donc il occupe
naturellement la largeur de son conteneur et grandit avec son contenu —
aucun calcul de hauteur, aucun `postMessage` de redimensionnement n'est
nécessaire (contrairement à une iframe). Le formulaire est conçu mobile
d'abord (boutons ≥ 44 px de hauteur tactile, aucune largeur fixe, pas de
défilement horizontal) et reste utilisable de 320 px à un écran de bureau.

## 7. Erreurs possibles côté intégrateur

| Symptôme | Cause probable |
|---|---|
| Le widget affiche « Les cartes cadeaux ne sont pas disponibles actuellement. » | Clé invalide/inconnue, intégration désactivée, ou organisation inactive (réponse volontairement identique dans les trois cas — voir `docs/api-public-gift-cards.md`) |
| Rien ne s'affiche du tout | `data-key` manquant (message visible uniquement dans la console navigateur), ou script non chargé (vérifier l'URL `src`) |
| Le paiement échoue systématiquement avec un message « paiement temporairement indisponible » | Domaine du site absent de `allowed_origins`, ou Stripe non configuré pour l'organisation |

Le widget n'affiche jamais un code d'erreur technique brut (`RATE_LIMITED`,
`CHECKOUT_UNAVAILABLE`…) à l'utilisateur final — voir § 11.

## 8. Isolation CSS

Le widget est rendu dans un **Shadow DOM fermé** (`attachShadow({mode:
'open'})` côté implémentation, contenu néanmoins inaccessible aux
sélecteurs CSS externes) attaché à l'élément `<hellopos-gift-card>`.
Concrètement :

- Les règles CSS du site hôte (même des sélecteurs génériques comme
  `button { ... }`, `input { ... }`, `* { box-sizing: content-box }`) ne
  peuvent **jamais** cibler un élément à l'intérieur du Shadow DOM — c'est
  une garantie de la plateforme web, pas une convention.
- `:host { all: initial; }` neutralise en plus l'**héritage** des
  propriétés CSS (police, couleur, taille de texte…) que le Shadow DOM ne
  bloque pas nativement (seules les règles/sélecteurs sont isolés, pas
  l'héritage).
- Inversement, la feuille de style du widget ne fuit jamais vers le
  document hôte (`<style>` posé DANS le Shadow DOM, jamais dans `<head>`).
- Testé explicitement dans `tests/gift-card-widget.test.ts` (§ « Isolation
  CSS »), y compris avec des règles hôtes hostiles.

## 9. Sécurité, origin et CORS

- Le widget ne connaît que `data-key` — jamais `organization_id`, jamais de
  secret Stripe, jamais d'identifiant HelloPos interne.
- Toutes les requêtes (`GET /config`, `POST /checkout`) sont protégées par
  le mécanisme `allowed_origins` **déjà existant** (étapes 2-3) : sans
  l'origine du site dans cette liste, le navigateur bloque la lecture des
  réponses et le paiement est impossible — le widget ne fait qu'appeler ces
  API, il ne peut pas contourner cette protection.
- Aucun `Access-Control-Allow-Origin: *` n'est utilisé nulle part dans ce
  système.
- Le montant, l'organisation, et toute autre donnée sensible restent
  validés côté serveur — le widget ne fait que refléter la configuration
  publique pour l'UX (voir § 10).

## 10. Source de vérité : la configuration n'est jamais figée en dur

Au chargement, le widget appelle `GET /api/public/gift-cards/config?key=...`
et affiche exactement ce que l'API renvoie (nom de l'organisation, montants
proposés, montant libre autorisé, bornes min/max). Si l'organisation change
ses montants dans HelloPos, le widget les reflète automatiquement au
prochain chargement — rien n'est codé en dur côté client.

## 11. Mapping des erreurs

Le widget traduit chaque code d'erreur public en un message compréhensible.
Les codes techniques ne sont **jamais** montrés à l'utilisateur final
(seulement journalisés en `console.error`, sans secret) :

| Code API | Message affiché |
|---|---|
| `GIFT_CARDS_NOT_AVAILABLE` | Les cartes cadeaux ne sont pas disponibles actuellement. |
| `ORIGIN_NOT_ALLOWED` | Ce site n'est pas autorisé à vendre des cartes cadeaux pour le moment. |
| `VALIDATION_ERROR` | Merci de vérifier les informations saisies. |
| `INVALID_AMOUNT` | Le montant choisi n'est pas valide. Merci de sélectionner un autre montant. |
| `INVALID_RETURN_PATH` | Une erreur de configuration empêche le paiement. Merci de réessayer plus tard. |
| `RATE_LIMITED` | Trop de tentatives ont été effectuées. Réessayez dans quelques instants. |
| `IDEMPOTENCY_KEY_CONFLICT` | Une erreur inattendue est survenue. Merci de recharger la page et réessayer. |
| `ORDER_ALREADY_COMPLETED` | Cette commande a déjà été traitée. |
| `ORDER_EXPIRED_RETRY_WITH_NEW_KEY` | Merci de réessayer. *(le widget renouvelle sa clé d'idempotence automatiquement)* |
| `PAYMENT_UNAVAILABLE` | Le paiement est temporairement indisponible. Réessayez dans quelques instants. |
| `CHECKOUT_UNAVAILABLE` | Le paiement est temporairement indisponible. Réessayez dans quelques instants. |
| *(réseau/inconnu)* | Une erreur est survenue. Merci de réessayer. |

## 12. Choix d'architecture

Quatre approches ont été comparées avant implémentation :

| Critère | A. Widget JS injecté dans le DOM hôte | B. iframe hébergée | C. Web Component + Shadow DOM | D. Page publique intégrable |
|---|---|---|---|---|
| Isolation CSS | ✗ (sans Shadow DOM, fuites dans les deux sens) | ✓ (totale, aux deux niveaux DOM/CSS) | ✓ (totale au niveau CSS, code JS partagé avec la page hôte) | ✗ |
| Compatibilité sites tiers | ✓ | ✓ | ✓ | ✗ (nécessite une intégration ad hoc, pas un simple embed) |
| Sécurité | ✓ (aucune donnée sensible manipulée côté client) | ✓✓ (isolation JS en plus) | ✓ | ✗ |
| Responsive / hauteur | ✓ (flux naturel) | Nécessite un `postMessage` de resize | ✓ (flux naturel, comme A) | — |
| Simplicité d'installation | ✓ | ✓ | ✓ (identique à A) | ✗ |
| Mises à jour sans toucher les sites clients | ✓ (URL de script stable) | ✓ | ✓ | ✗ |
| Contrainte technique HelloPos découverte à l'analyse | — | **`X-Frame-Options: DENY` est posé globalement dans `next.config.mjs` pour toute l'application** — une iframe publique nécessiterait un assouplissement CIBLÉ de cet en-tête de sécurité, qui protège aujourd'hui l'ensemble de HelloPos contre le clickjacking | Aucune modification des en-têtes de sécurité existants nécessaire | — |

**Choix retenu : C — élément personnalisé (Web Component) avec Shadow DOM
fermé.** Il cumule l'isolation CSS forte (l'exigence explicite la plus
stricte de cette étape) avec la simplicité d'installation d'un script
classique, **sans** avoir à affaiblir `X-Frame-Options: DENY` (qui protège
aujourd'hui toute l'application HelloPos contre le détournement de clics,
et qui aurait dû être partiellement levé pour une route dédiée si l'iframe
avait été retenue). L'option D a été écartée d'emblée : elle ne correspond
pas à un embed simple sur un site tiers, contrairement à l'objectif de
cette étape.

Livré comme un **script classique** (`<script src="…">`, pas de module ES)
pour une compatibilité maximale (aucune étape de build requise côté
intégrateur, y compris sur un CMS qui ne supporte pas nativement les
modules ES).

## 13. Vie privée / stockage

Le widget n'écrit **jamais** en `localStorage`. Deux usages temporaires en
`sessionStorage`, scopés par `public_key`, avec expiration :

- `hellopos_gc_draft_<key>` : un instantané du formulaire (montant,
  noms, emails, message, mode d'envoi, clé d'idempotence en cours) posé
  juste avant la redirection vers Stripe Checkout, pour permettre de
  reprendre une tentative annulée sans ressaisir les informations. Expire
  après 30 minutes.
- `hellopos_gc_intent_<key>` : uniquement `delivery_mode` et le nom du
  bénéficiaire (aucun email, aucun message), pour adapter le texte de
  l'écran de succès. Lu puis **immédiatement supprimé** au retour de
  Stripe.

Aucune de ces deux clés ne contient de donnée dans l'URL de retour — le
seul paramètre ajouté par le backend est `?session_id=...` (identifiant de
session Stripe, non sensible en lui-même).

## 14. Environnement local / dev

En développement (`localhost`), le widget fonctionne à l'identique :
l'origine de l'API HelloPos est déduite de l'URL du script lui-même (voir
`public/gift-cards/widget/v1/embed.js::resolveApiBase`), donc pointer le
`<script src>` vers une instance HelloPos locale (`http://localhost:3000/
gift-cards/widget/v1/embed.js`) suffit à faire dialoguer le widget avec
cette instance — à condition d'ajouter l'origine du site de test à
`allowed_origins` (voir § 2 ; `http://localhost:PORT` y est explicitement
toléré).

## 15. Versionnage

Le script est servi sous une URL **versionnée** :

```
/gift-cards/widget/v1/embed.js
```

Un correctif ou une amélioration non cassante est publié EN PLACE sous
cette même URL `v1` (mise en cache courte : 5 minutes — voir
`next.config.mjs`). Une évolution qui casserait la compatibilité (contrat
d'attributs, structure d'événements…) serait publiée sous un nouveau
préfixe `v2`, laissant `v1` fonctionner à l'identique pour les sites déjà
intégrés — pas de système de versionnage plus complexe que ce simple
préfixe de chemin.

## 16. Ce que ce widget NE fait PAS (hors périmètre de cette étape)

- Aucune page spécifique à une organisation cliente (Plante Verte, Fanny
  Fleurs…) — ce sera l'objet d'une étape ultérieure d'intégration.
- Aucun envoi programmé (Noël, anniversaire…).
- Aucun export PDF, aucun QR code.
- Aucune interface de renvoi d'email, aucune administration des ventes en
  ligne.
- Aucune consultation publique du code d'une carte, avant ou après
  paiement.
