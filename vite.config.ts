import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
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
