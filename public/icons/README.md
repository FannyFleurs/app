# Icônes PWA

Les fichiers requis sont :
- `icon-192.png` (192×192) — référencé dans `manifest.json`
- `icon-512.png` (512×512) — référencé dans `manifest.json`
- `icon-1024.png` (1024×1024) — référencé dans `manifest.json`
- `apple-touch-icon.png` (180×180) — référencé dans `<link rel="apple-touch-icon">`

`icon.svg` est fourni comme base. Pour générer les PNG depuis le SVG :

```bash
# Avec ImageMagick (macOS : brew install imagemagick)
cd public/icons
magick icon.svg -resize 192x192 icon-192.png
magick icon.svg -resize 512x512 icon-512.png
magick icon.svg -resize 1024x1024 icon-1024.png
magick icon.svg -resize 180x180 apple-touch-icon.png
```

Ou utilisez un outil en ligne comme https://realfavicongenerator.net/.

Une fois les PNG en place, l'installation PWA fonctionne sur iOS et Android.
