// Stub pour les tests Vitest : le vrai paquet `server-only` (utilisé par les
// fichiers *-server.ts) refuse de se résoudre hors d'un bundler Next/webpack.
// Sous Vitest (Node pur), on veut justement pouvoir importer ces fichiers
// directement pour les tester — ce stub ne fait rien, comme le paquet réel
// quand `window` est indéfini (ce qui est toujours le cas ici).
export {};
