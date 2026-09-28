import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@badgetrip/core': r('./packages/core/src/index.ts'),
      '@badgetrip/testing': r('./packages/testing/src/index.ts'),
      '@badgetrip/react': r('./packages/react/src/index.ts'),
      '@badgetrip/assets': r('./packages/assets/src/index.ts'),
      '@badgetrip/react-native': r('./packages/react-native/src/index.ts'),
      '@badgetrip/vue': r('./packages/vue/src/index.ts'),
      '@badgetrip/html': r('./packages/html/src/index.ts'),
      '@badgetrip/ipc': r('./packages/ipc/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
