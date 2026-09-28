import { fileURLToPath } from 'node:url';
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [angular({ tsconfig: r('./tsconfig.json') })],
  resolve: {
    alias: {
      '@badgetrip/core': r('../core/src/index.ts'),
      '@badgetrip/assets': r('../assets/src/index.ts'),
      '@badgetrip/ipc': r('../ipc/src/index.ts'),
      '@badgetrip/angular': r('./src/index.ts'),
    },
  },
  test: {
    include: ['test/**/*.spec.ts'],
    environment: 'jsdom',
    setupFiles: ['test/setup.ts'],
  },
});
