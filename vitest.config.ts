import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      // Le paquet réel refuse de se résoudre hors bundler Next/webpack ;
      // ce stub (tests/stubs/server-only.ts) permet de tester directement
      // les fichiers *-server.ts sous Vitest (Node pur).
      'server-only': new URL('./tests/stubs/server-only.ts', import.meta.url).pathname,
      '@': new URL('.', import.meta.url).pathname,
    },
  },
});
