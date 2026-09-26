# API publique — Cartes cadeaux en ligne

> Statut : étape 2/N. Cette route ne fait QUE lire la configuration
> commerciale d'une organisation. Aucun paiement, aucune carte cadeau créée,
> aucun email envoyé. Voir `lib/settings/online-gift-cards.ts` pour la
> configuration côté admin (Paramètres → Cartes cadeaux en ligne).

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
