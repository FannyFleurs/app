# App iOS sur Mac : affichage réduit

## Symptôme

Ouverte sur un Mac (Apple Silicon) via la version « native » téléchargée sur
l'App Store, HelloPos s'affiche en tout petit, dans une fenêtre qui ne se
redimensionne pas. On veut retrouver l'affichage plein, comme sur le web.

## Cause

L'app de l'App Store est un projet iOS distinct de ce dépôt (ce dépôt ne
contient que l'app web Next.js : pas de projet Xcode, pas d'`Info.plist`, pas
de Capacitor). Deux façons pour une app iOS de tourner sur Mac :

1. « Conçue pour iPad » (iPhone/iPad Apps on Mac) : macOS exécute le binaire
   iPad tel quel, dans une fenêtre de taille fixe calée sur la résolution en
   points d'un iPad. La fenêtre n'est pas librement redimensionnable et le
   contenu paraît réduit. C'est le comportement observé.
2. Mac Catalyst : le même code produit une vraie app Mac, dans une fenêtre
   redimensionnable, à l'échelle du Mac.

Le réglage se fait donc dans le projet iOS, pas ici.

## Côté web (ce dépôt) : ne pas compter dessus pour agrandir

Le zoom est bloqué volontairement pour la caisse tactile (éviter les zooms
accidentels) :

- `app/layout.tsx` : viewport `maximumScale: 1, minimumScale: 1,
  userScalable: false`.
- `components/NoZoom.tsx` : intercepte Cmd/Ctrl + « + / - / 0 » et le
  pincement. Monté sur la caisse et le layout app.

Conséquence : dans la coque, l'utilisateur ne peut pas agrandir avec Cmd +.
On ne lève pas ce blocage (choix retenu : corriger la coque native).

## Solution recommandée : reconstruire en Mac Catalyst

Dans le projet Xcode de l'app iOS :

1. Cible de l'app → onglet General → section « Supported Destinations ».
2. Ajouter la destination « Mac (Mac Catalyst) » (en plus d'iPad).
3. Rebuild et re-soumission App Store.

L'app obtient alors une fenêtre Mac redimensionnable et un rendu à l'échelle du
Mac : l'affichage réduit disparaît. C'est la correction propre et durable.

## Alternative si coque WKWebView maison

Si l'app est une simple coque qui charge le site dans un `WKWebView` et qu'on
ne veut pas passer par Catalyst tout de suite, on peut agrandir le contenu par
programme via la propriété native `pageZoom` (WKWebView, iOS 14+ / macOS 11+) :

```swift
webView.pageZoom = 1.3 // à ajuster
```

`pageZoom` agit au niveau natif du moteur de rendu : il n'est pas neutralisé
par `NoZoom` (qui ne bloque que les événements clavier/pincement, pas cette
propriété). À réserver au cas « exécution sur Mac » pour ne pas grossir le
rendu sur iPad.

## Solution immédiate sans rien reconstruire

En attendant, sur le Mac : ouvrir HelloPos dans Safari ou Chrome (même URL que
l'app). L'affichage bureau est plein et le zoom navigateur fonctionne.
