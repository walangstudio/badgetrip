import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@walangstudio/badgetrip-core': r('../../packages/core/src/index.ts'),
      '@walangstudio/badgetrip-react': r('../../packages/react/src/index.ts'),
      '@walangstudio/badgetrip-assets': r('../../packages/assets/src/index.ts'),
    },
  },
});
