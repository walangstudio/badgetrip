import { fileURLToPath } from 'node:url';
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [angular({ tsconfig: r('./tsconfig.json') })],
  resolve: {
    alias: {
      '@walangstudio/badgetrip-core': r('../core/src/index.ts'),
      '@walangstudio/badgetrip-assets': r('../assets/src/index.ts'),
      '@walangstudio/badgetrip-ipc': r('../ipc/src/index.ts'),
      '@walangstudio/badgetrip-html': r('../html/src/index.ts'),
      '@walangstudio/badgetrip-angular': r('./src/index.ts'),
    },
  },
  test: {
    include: ['test/**/*.spec.ts'],
    environment: 'jsdom',
    setupFiles: ['test/setup.ts'],
  },
});
