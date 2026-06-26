#!/usr/bin/env bash
set -e

# Installation déterministe : on n'écrase pas un node_modules existant.
if [ ! -d node_modules ]; then
  echo "▶ Installation des dépendances…"
  npm install --no-audit --no-fund --prefer-offline 2>&1 | tail -20 || true
fi

echo "✓ Webpos POS prêt. Commandes utiles :"
echo "  npm run dev          # lance le serveur (port 3000)"
echo "  npm run typecheck    # vérification TS"
echo "  npm test             # tests Vitest"
echo "  npm run db:migrate   # applique les migrations (nécessite Postgres)"
echo "  npm run db:seed      # crée l'organisation de démo"
