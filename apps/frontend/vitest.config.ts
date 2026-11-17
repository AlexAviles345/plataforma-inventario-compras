import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const fromSource = (relativePath: string) =>
  fileURLToPath(new URL(`./src/${relativePath}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fromSource(''),
      '@shared': fromSource('app/shared'),
      '@modules': fromSource('app/modules'),
      '@auth': fromSource('app/auth'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/app/**/*.{ts,tsx}'],
      exclude: [
        'src/app/shared/components/ui/**',
        'src/app/**/index.ts',
        'src/app/**/types/**',
      ],
    },
  },
});
