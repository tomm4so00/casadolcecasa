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
      output: {
        manualChunks: {
          firebase: ['firebase/compat/app', 'firebase/compat/database', 'firebase/compat/auth'],
        },
      },
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
