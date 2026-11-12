import { defineConfig } from 'vitest/config';
import { version } from './package.json';

export default defineConfig({
  base: './',
  plugins: [
    {
      // la versione online, letta dalla manutenzione per il banner "Nuova versione!"
      name: 'version-json',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ version }),
        });
      },
    },
  ],
  build: {
    rollupOptions: {
      // il gioco e la pagina del trasloco (src/game/move-rules.ts)
      input: { main: 'index.html', trasloco: 'trasloco.html' },
      output: {
        manualChunks: {
          firebase: ['firebase/compat/app', 'firebase/compat/database', 'firebase/compat/auth'],
        },
      },
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
