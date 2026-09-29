import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@walangstudio/badgetrip-core': r('../../packages/core/src/index.ts'),
      '@walangstudio/badgetrip-testing': r('../../packages/testing/src/index.ts'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    // The contract suite registers nothing without BADGETRIP_PG_URL.
    passWithNoTests: true,
  },
});
