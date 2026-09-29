import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // Relative asset paths, so the built page works from any folder (GitHub Pages, a CDN).
  base: './',
  resolve: {
    alias: {
      '@badgetrip/core': r('../../packages/core/src/index.ts'),
      '@badgetrip/assets': r('../../packages/assets/src/index.ts'),
      '@badgetrip/html': r('../../packages/html/src/index.ts'),
    },
  },
});
