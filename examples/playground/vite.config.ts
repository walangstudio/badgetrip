import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // Relative asset paths, so the built page works from any folder (GitHub Pages, a CDN).
  base: './',
  resolve: {
    alias: {
      '@walangstudio/badgetrip-core': r('../../packages/core/src/index.ts'),
      '@walangstudio/badgetrip-assets': r('../../packages/assets/src/index.ts'),
      '@walangstudio/badgetrip-html': r('../../packages/html/src/index.ts'),
    },
  },
});
