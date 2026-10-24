import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  test: { include: ['test/**/*.test.ts'], testTimeout: 60000 },
});
