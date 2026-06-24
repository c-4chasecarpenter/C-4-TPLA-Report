import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// jsdom gives us File / FileReader / Blob so we can drive the real parseFile()
// with actual File objects built from fixtures — true end-to-end ingestion tests.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['lib/**/*.test.ts', 'tests/**/*.test.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
});
