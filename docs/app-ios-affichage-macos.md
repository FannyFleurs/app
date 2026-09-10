# App iOS (Capacitor) sur Mac : affichage réduit

## Symptôme

Ouverte sur un Mac (Apple Silicon) via la version « native » téléchargée sur
l'App Store, HelloPos s'affiche en tout petit, dans une fenêtre qui ne se
redimensionne pas. On veut retrouver un affichage à taille normale.

## Contexte

L'app de l'App Store est un projet **Capacitor** distinct de ce dépôt
(`hellopos-capacitor`, projet Xcode `ios/App/App.xcodeproj`). Ce dépôt-ci ne
contient que l'app web Next.js chargée dans la WebView de la coque.

Sur un Mac Apple Silicon, une app iOS peut tourner de deux façons :

1. « Conçue pour iPad » (iPhone/iPad Apps on Mac) : macOS exécute le binaire
   iPad, dans une fenêtre calée sur la résolution en points d'un iPad. Le
   contenu paraît réduit. C'est le mode actuel.
2. Mac Catalyst : produirait une vraie app Mac redimensionnable.

## Mac Catalyst : impossible avec Capacitor

Activer la destination « Mac (Mac Catalyst) » dans Xcode déclenche exactement
l'erreur observée :

```
While building for Mac Catalyst, no library for this platform was found in
'.../capacitor-swift-pm/Capacitor/Capacitor.xcframework'
```

Raison : Capacitor cible officiellement iOS, Android et Web. Les `xcframework`
distribués (`Capacitor.xcframework`, `Cordova.xcframework`) ne contiennent
**pas** de tranche `ios-arm64-maccatalyst`. Il n'y a donc rien à linker pour
Catalyst, et il n'existe pas de build Catalyst officiel de Capacitor.

À faire : **retirer** la destination « Mac (Mac Catalyst) » qu'on vient
d'ajouter (cible App → General → Supported Destinations), pour revenir à un
build iPad qui compile. On reste donc en « Conçue pour iPad ».

## Solution retenue : agrandir la WebView sur Mac (pageZoom)

Puisqu'on reste en « Conçue pour iPad », on agrandit le contenu de la WebView
uniquement quand l'app tourne sur Mac, via la propriété native
`WKWebView.pageZoom` (Apple, iOS 14+). La détection se fait avec
`ProcessInfo.processInfo.isiOSAppOnMac` (Apple, iOS 14+), vrai seulement quand
un binaire iPad s'exécute sur Mac.

Capacitor expose la WebView et un point d'extension : `CAPBridgeViewController`
a une propriété `webView: WKWebView?` et une méthode surchargeable
`capacitorDidLoad()`, appelée une fois `webView` et `bridge` disponibles
(vérifié dans la source Capacitor).

Dans le projet Capacitor, éditer le contrôleur de l'app
(`ios/App/App/ViewController.swift`, sous-classe de `CAPBridgeViewController`
— le créer s'il n'existe pas et le référencer dans le storyboard) :

```swift
import UIKit
import Capacitor

class ViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        // Sur Mac (app "Conçue pour iPad"), le rendu iPad paraît petit.
        // On agrandit uniquement là ; sur iPad/iPhone on ne touche à rien.
        if ProcessInfo.processInfo.isiOSAppOnMac {
            webView?.pageZoom = 1.3 // à ajuster (1.2 à 1.5 selon le ressenti)
        }
    }
}
```

`pageZoom` agit au niveau natif du moteur de rendu : il n'est pas neutralisé
par le blocage de zoom côté web (voir ci-dessous). Si le zoom ne s'applique pas
depuis `capacitorDidLoad()` (WebView pas encore dans la hiérarchie), le poser
aussi dans `viewDidAppear(_:)`, toujours derrière le même test
`isiOSAppOnMac`.

## Côté web (ce dépôt) : ne pas compter dessus pour agrandir

Le zoom est bloqué volontairement pour la caisse tactile (éviter les zooms
accidentels) :

- `app/layout.tsx` : viewport `maximumScale: 1, minimumScale: 1,
  userScalable: false`.
- `components/NoZoom.tsx` : intercepte Cmd/Ctrl + « + / - / 0 » et le
  pincement. Monté sur la caisse et le layout app.

Ces protections n'empêchent pas `pageZoom` (propriété native, pas un
événement clavier/pincement). On ne les lève pas.

## Dépannage immédiat, sans rebuild

Sur le Mac : ouvrir HelloPos dans Safari ou Chrome (même URL que l'app).
Affichage bureau plein et zoom navigateur fonctionnel.
