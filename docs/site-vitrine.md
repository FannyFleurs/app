# Site public hellopos.fr

Le site public vit dans `app/site/`. Il partage le projet Next.js de
l'application, mais rien d'autre : ses styles, ses composants et ses contenus
lui sont propres.

---

## 1. Où se trouve quoi

| Emplacement | Rôle |
| --- | --- |
| `app/site/site.css` | Design system complet : jetons, primitives, composants |
| `app/site/layout.tsx` | En-tête, pied de page, `viewport`, données structurées |
| `app/site/_components/` | Composants du site (aucun n'est utilisé par l'app) |
| `lib/site/routes.ts` | Cartographie des URLs publiques (middleware + sitemap) |
| `lib/site/meta.ts` | Métadonnées de page et données structurées |
| `lib/site/analytics.ts` | Plan de taggage et fonction `track()` |
| `lib/site/content/` | **Tout le contenu éditorial**, en TypeScript typé |
| `lib/site/media.ts` | Emplacements photo déclarés |
| `lib/site/publication.ts` | État de publication du site (voir § 6) |
| `app/site/_components/HoldingScreen.tsx` | Écran affiché quand le site n'est pas publié |
| `public/site/screens/` | Captures réelles du logiciel (PNG + WebP 1600 et 800 px) |
| `public/site/fonts/` | Fraunces et Inter, auto-hébergées (OFL 1.1) |

Le routage d'URL propre (`hellopos.fr/tarifs` → `/site/tarifs`) est fait par
`middleware.ts`, qui interroge `isMarketingPath()`. **Une page ajoutée dans
`lib/site/routes.ts` est automatiquement servie à l'apex et référencée dans le
plan du site.**

---

## 2. Règle absolue : ne rien inventer

Le site ne publie aucun témoignage, chiffre, note, partenaire, certification
ou compatibilité matérielle qui ne soit pas vérifié.

Concrètement :

- `lib/site/content/showcase.ts` contient des tableaux **vides** pour les
  témoignages, les cas clients et les articles. Les mises en page existent et
  sont testées ; elles s'afficheront dès qu'un contenu réel sera ajouté.
- Les différences entre offres décrites dans `lib/site/content/plans.ts` sont
  celles que le code applique réellement (`lib/billing/plan-limits.ts`,
  `settings/screen-delivery`, `settings/loyalty`).
- `lib/site/content/hardware.ts` ne cite que le matériel visible dans le
  produit, et affiche « à vérifier ensemble » pour l'affichage client et le TPE,
  qui ne sont pas pris en charge à ce jour.
- La page `/conformite` indique explicitement qu'aucune certification n'est
  revendiquée : la preuve repose sur l'attestation individuelle de l'éditeur,
  éditable depuis l'application.

---

## 3. Ajouter du contenu

### Un témoignage

```ts
// lib/site/content/showcase.ts
export const TESTIMONIALS: Testimonial[] = [
  {
    shop: 'Nom du commerce',
    city: 'Ville',
    activity: 'Fleuriste',
    person: { name: 'Prénom N.', role: 'Gérante' }, // facultatif
    quote: 'Phrase exacte, relue et validée par le commerce.',
    photoSlot: 'temoignage-1', // facultatif
    caseSlug: 'nom-du-commerce', // si un cas client existe
  },
];
```

La section « Ils utilisent HelloPos au quotidien » de l'accueil bascule
automatiquement du message d'attente vers le témoignage.

### Un cas client

Ajouter une entrée à `CASES` : le `slug` devient l'URL `/clients/<slug>`, la
page est générée et référencée dans `sitemap.xml`. Les chiffres du champ
`results` doivent être communiqués par le commerce — jamais estimés.

### Un article de ressources

Ajouter une entrée à `RESOURCES` : l'URL `/ressources/<slug>` est générée. La
page `/ressources` remplace alors le bloc « À paraître » par la liste des
articles.

### Une photo

1. Déposer les fichiers dans `public/site/photos` :
   `<slot>.avif`, `<slot>.webp`, `<slot>.jpg` en 1600 px, et si possible
   `<slot>-m.*` en 800 px.
2. Déclarer l'emplacement dans `lib/site/media.ts` :

```ts
export const PHOTOS: Record<string, PhotoAsset> = {
  'trade-fleuristes': {
    base: '/site/photos/trade-fleuristes',
    alt: 'Comptoir d’un fleuriste, compositions en préparation',
    mobile: true,
  },
};
```

Le composant `<Visual>` affiche la photographie dès qu'elle existe et, tant
qu'elle n'existe pas, montre une capture du logiciel. Aucune page n'est à
modifier, et le site n'affiche jamais de cadre vide.

### Un métier

Ajouter le slug à `TRADE_SLUGS` (`lib/site/routes.ts`), son chemin SEO dans
`SEO_PATH_BY_TRADE`, une entrée complète dans `TRADES`
(`lib/site/content/trades.ts`) — avec un contenu `seo` réellement écrit pour ce
commerce — puis créer le dossier `app/site/logiciel-caisse-<métier>/page.tsx`
sur le modèle des cinq existants.

---

## 4. Design system

Tout est porté par la classe racine `.hp`, posée sur le conteneur du layout.
Aucun style ne fuit vers la caisse ou le back-office.

- **Couleurs** : `--green #013e37`, `--gold #ffefb3`, `--cream #fbf9f2`,
  `--paper #fffdf7`, `--ink #012f2b`, `--ink-soft`, `--ink-faint`, `--line`.
  Les gris chauds sont calibrés pour rester au-dessus de 4,5:1 sur le crème.
- **Typographies** : Fraunces (titres, `--font-display`), Inter (texte,
  `--font-sans`). Échelle fluide : `--fs-display`, `--fs-hero`, `--fs-h1` à
  `--fs-h4`, `--fs-lede`, `--fs-body`, `--fs-sm`, `--fs-xs`, `--fs-label`.
- **Rythme** : `--section-y`, `--gutter`, `--w-page`, `--w-text`.
- **Boutons** : `.hp-btn` + `--primary` (vert, calque doré décalé), `--gold`
  (sur fond vert), `--ghost`. Tailles `--sm` / `--lg`, largeur pleine `--block`.
- **Composants** : `.hp-index` (index fonctionnel), `.hp-story` (récit produit),
  `.hp-day` (timeline), `.hp-plans` / `.hp-table` (tarifs), `.hp-acc` (FAQ),
  `.hp-tabs` (métiers), `.hp-web` (« tout est lié »), `.hp-device` /
  `.hp-window` / `.hp-shot-crop` (captures).

**Animations** : les apparitions ne sont appliquées que si le JavaScript a posé
`hp-js` sur la racine — sans JavaScript, tout le contenu est visible. Elles sont
désactivées sous `prefers-reduced-motion`.

---

## 5. Mesure des conversions

`lib/site/analytics.ts` définit les événements. Aucun outil n'est imposé :
`track()` pousse vers `dataLayer`, `gtag`, Plausible et Matomo s'ils sont
présents, et ne fait rien sinon.

Les éléments cliquables portent `data-track="<événement>"` et, au besoin,
`data-track-props='{"emplacement":"hero"}'`. Un unique écouteur délégué
(`SiteRuntime`) envoie l'événement : aucun gestionnaire par bouton.

| Événement | Déclencheur |
| --- | --- |
| `essai_hellopos` | CTA « Essayer HelloPos » / « Commencer gratuitement » |
| `reserver_demo` | CTA « Réserver une démo », envoi du formulaire |
| `voir_demo` | CTA « Voir la démo », lecture de la vidéo |
| `voir_tarifs` | Liens vers la page Tarifs |
| `choisir_formule` | Choix d'une formule (`formule: smart\|pro\|reseau`) |
| `formulaire_commence` | Première saisie dans un formulaire |
| `formulaire_envoye` | Envoi réussi du formulaire de contact |
| `page_metier` | Affichage d'une page métier ou changement d'onglet |
| `cas_client` | Affichage d'un cas client |
| `materiel` | Affichage de la page Matériel |

---

## 6. Publier / dépublier le site public

L'interrupteur est dans la console d'administration :
**Configuration → Site public**, deux boutons `Off` / `On`.

Le réglage est enregistré en base (`platform_settings.site_public`) et pris en
compte à la requête suivante : pas de redéploiement, pas de délai de cache. Le
gabarit du site est rendu à la demande (`force-dynamic`), c'est ce qui rend la
bascule immédiate.

Par défaut, une plateforme n'a pas son site publié : il faut l'activer.

### Off — seule la page d'attente est en ligne

- La racine du domaine affiche l'écran d'attente (`HoldingScreen`) : le titre
  de l'accueil (`HOME_TITLE`, partagé avec la vraie page), une description
  courte, et un bouton « Nous contacter » qui ouvre le formulaire dans une
  fenêtre — sans navigation, donc sans risque d'atterrir sur une page qui
  n'est pas servie. Le formulaire poste sur `/api/contact`, qui fonctionne
  dans les deux états. La connexion reste accessible, discrètement, dans
  l'en-tête. Aucun message d'indisponibilité. L'URL ne change pas, la réponse
  est en `200` et la page est en `noindex`.
- `/mentions-legales` et `/confidentialite` restent servies, avec un en-tête
  réduit (logo + connexion) au lieu de la navigation du site : une page qui
  collecte des coordonnées doit pouvoir dire ce qu'elle en fait.
- À droite du texte au-delà de 1000 px, le produit : la photo déclarée sous
  l'emplacement `attente-appareils` (voir § 3) ou, à défaut, l'écran de caisse
  réel dans une tablette. En dessous, le visuel passe sous le texte, pleine
  largeur — un montage tablette + téléphone n'est plus lisible en colonne
  étroite.
- Toutes les autres adresses du site (`/tarifs`, `/solutions/…`,
  `/logiciel-caisse-…`, `/site/*`) répondent en **307** vers la racine.
- La création de compte est fermée : `/setup` renvoie sur la page d'attente et
  `POST /api/auth/setup` répond `403`. Une interface fermée sans serveur fermé
  ne serait qu'un décor.
- `sitemap.xml` ne liste plus aucune URL, `robots.txt` ne l'annonce plus.
  L'exploration reste autorisée pour que les moteurs lisent le `noindex` et
  retirent les pages de leurs résultats.
- Les polices, captures et l'image de partage (`/site/fonts/…`,
  `/site/screens/…`, `/site/photos/…`, `/site/og.png`) restent servies.

### On — le site complet

Toutes les pages redeviennent accessibles et indexables, le plan du site est de
nouveau annoncé, la création de compte est rouverte.

### Ce qui n'est jamais affecté

`app.`, `bo.`, `ca.`, `ecran.`, `pda.` et `admin.` fonctionnent à l'identique
dans les deux états, y compris `hellopos.fr/caisse` qui continue de rediriger
vers `app.<domaine>`. Le middleware ne consulte pas ce réglage : il tourne sur
l'edge, sans accès à la base, et se contente de transmettre le chemin d'origine
(`x-hp-path`) au rendu, qui décide.

### Forçage d'environnement

`SITE_PUBLIC=on` publie le site quel que soit le réglage en base. Utile sur une
préversion pour relire le site pendant qu'il est hors ligne en production. À ne
pas définir en production, où c'est la console qui commande.

### Vérifier l'état

```bash
curl -sI https://hellopos.fr/tarifs      # 307 -> / si non publié, 200 sinon
curl -s  https://hellopos.fr/robots.txt  # ligne Sitemap présente si publié
curl -sI https://app.hellopos.fr/login   # doit répondre dans les deux cas
```

---

## 7. Contrôles avant mise en ligne

```bash
npm run typecheck   # types
npm run build       # build de production (toutes les routes)
npm start           # serveur de production sur :3000
```

Vérifications faites à chaque évolution notable :

- toutes les routes en 200, à trois largeurs (1440 / 834 / 390) ;
- aucun débordement horizontal, aucune erreur console ;
- audit axe-core (WCAG 2.1 AA) sans violation ;
- navigation au clavier : menu mobile, onglets métiers, accordéon FAQ ;
- `prefers-reduced-motion` : aucun bloc ne reste invisible ;
- `sitemap.xml` et `robots.txt` à jour.
