import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the app from https://<user>.github.io/<repo>/, so the
// asset base must match the repository name. Locally (dev/preview) we stay at '/'.
const repositoryName = 'ICTSupplyChainMapper';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? `/${repositoryName}/` : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // The core logic is UI-free, so the default node environment is enough.
    // A jsdom environment is only needed once component tests are added.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
