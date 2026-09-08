# CodeMap — carte interactive du code (outil de dev local)

Retrouve rapidement **où intervenir dans le code** pour modifier une
fonctionnalité de HelloPos. Recherche par mots-clés ou en langage naturel
(« Où modifier ? »), avec pertinence, extraits, numéros de ligne et carte
d'architecture.

## Lancer

```bash
npm run codemap
```

Puis ouvrir **http://127.0.0.1:4321** (port configurable via `CODEMAP_PORT`).

## Ce que c'est / ce que ce n'est pas

- Outil **100 % local de développement**. Bind sur `127.0.0.1` uniquement.
- **N'est pas** intégré à l'application, **jamais** déployé, **jamais** en prod.
- **Lecture seule** du dépôt. Seule écriture : le cache `tools/codemap/.index.json`.
- **Aucun** appel réseau externe, **aucun** envoi de code, **aucune** dépendance,
  ne touche ni HelloPos ni la base.

## Fonctions

- **Recherche** : fichiers, dossiers, fonctions, composants React, hooks, imports,
  routes/API, tables Postgres (migrations + requêtes), textes d'interface,
  commentaires. Tolérante aux accents, à la casse et aux pluriels simples ; le
  lexique fait le pont FR↔technique (« clôture caisse » → `closeRegister`, …).
- **Où modifier ?** : demande en langage naturel → Fichier principal / Fichiers
  associés / Base·SQL·API, avec le rôle de chaque fichier.
- **Copier pour Claude Code** : génère un prompt prêt à coller (fichiers + rôles
  + lignes).
- **Ouvrir dans VS Code** à la bonne ligne (commande `code` requise ; repli
  `open -a "Visual Studio Code"` sur macOS).
- **Réindexer** : reconstruit l'index (incrémental) ; date de dernière
  indexation et nombre de fichiers affichés en haut.

## Mode IA (plus tard, optionnel)

Le mode « Où modifier ? » est heuristique et local. L'architecture prévoit un
branchement IA optionnel : `registerResolver('ai', fn)` dans `search.mjs`. Le
resolver IA recevrait `(ctx, query, base)` où `base` est déjà le résultat
heuristique, et n'aurait qu'à l'affiner — sans réécrire l'outil.

## Fichiers

- `server.mjs` — serveur local + API (`/api/search`, `/api/reindex`, `/api/open`,
  `/api/file`, `/api/architecture`, `/api/meta`).
- `indexer.mjs` — parcours disque, extraction, normalisation, index.
- `search.mjs` — scoring/pertinence, « Où modifier ? », carte d'architecture.
- `lexicon.mjs` — lexique de domaine FR↔technique + clusters fonctionnels.
- `ui.html` — interface (page unique).
