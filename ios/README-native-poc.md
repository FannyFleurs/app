# HelloPos - App native iOS (POC imprimante réseau)

Coquille Capacitor qui embarque l'application hébergée `https://app.hellopos.fr`
et ajoute l'impression directe sur imprimante ticket réseau (ESC/POS, port RAW
9100), en remplacement des imprimantes Star CloudPRNT.

## Principe

- Le webview charge l'app hébergée. Un script injecté (`AppDelegate.swift`)
  intercepte les appels `fetch` de la caisse et, pour chaque famille de
  document thermique, récupère le PDF frère (`/pdf`), le rastérise et l'envoie
  en ESC/POS :
  - `POST /api/receipts/.../print` (tickets de vente, + ticket cadeau sans prix)
  - `POST /api/credit-notes/.../print` (avoirs, N exemplaires via `copies`)
  - `POST /api/gift-cards/.../print` (cartes cadeaux, code-barres EAN-13 inclus)
  - `POST /api/cash-sessions/open-drawer` -> impulsion tiroir ESC/POS
    (uniquement si CloudPRNT n'a pas déjà envoyé l'impulsion).
- Le plugin natif `HelloPosPrinter` (`HelloPosPrinterPlugin.swift`) ouvre une
  socket TCP (`Network.framework`) vers l'imprimante et pousse les octets bruts.

### Non couvert (volontairement)

- **Rapport X/Z** (`/api/reports/day`) et **factures** (`/api/invoices`) : leur
  endpoint `/pdf` de production est au format **A4**, illisible une fois
  rastérisé en 80 mm. Comme la version PWA en production ne doit pas être
  modifiée, ces documents restent sur le circuit CloudPRNT/Star. Sur l'app
  native sans imprimante Star, l'impression du X/Z renverra `NO_PRINTER`.

## Réglages imprimante

- Nom (optionnel), adresse IP, port et largeur papier (80 mm / 576 pts ou
  58 mm / 384 pts) sont saisis sur l'écran de réglages
  (`native-shell/index.html`) et **mémorisés sur l'appareil** (`UserDefaults`,
  via `getSettings`/`saveSettings`). L'adresse est validée (IPv4 ou nom d'hôte)
  avant test/enregistrement.
- Au premier lancement (non configuré), l'app ouvre directement l'écran de
  réglages. Une fois enregistré, elle ouvre HelloPos.
- Le bouton flottant (roue crantée, en bas à droite) permet de revenir aux
  réglages à tout moment (changement d'IP, test).

## Build

Prérequis : macOS + Xcode, Node, CocoaPods non requis (SPM).

```bash
npm install
npx cap sync ios      # copie native-shell/ + génère capacitor.config.json
open ios/App/App.xcodeproj
```

Puis lancer sur un iPad/iPhone du même réseau local que l'imprimante.
iOS demande l'autorisation « réseau local » au premier accès imprimante
(`NSLocalNetworkUsageDescription` dans `Info.plist`).

Note : `ios/App/App/public/` et `ios/App/App/capacitor.config.json` sont
générés par `npx cap sync` (ignorés par git) : relancer la sync après chaque
modification de `native-shell/` ou de `capacitor.config.ts`.

## Méthodes du plugin `HelloPosPrinter`

| Méthode          | Rôle                                                        |
|------------------|-------------------------------------------------------------|
| `getSettings`    | Lit les réglages mémorisés (`host`, `port`, `widthDots`, `configured`). |
| `saveSettings`   | Enregistre les réglages.                                    |
| `testConnection` | Test d'ouverture de socket TCP.                             |
| `printTest`      | Imprime un ticket de test.                                  |
| `printPdf`       | Rastérise un PDF (base64) et l'imprime (`GS v 0`).          |
| `openDrawer`     | Impulsion tiroir-caisse (`ESC p`), sans avance papier.      |

Les méthodes acceptent `host`/`port` explicites ; à défaut elles utilisent les
réglages mémorisés.
