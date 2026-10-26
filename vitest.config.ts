import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['packages/**/*.test.ts'], environment: 'node' } },
      { test: { name: 'db', include: ['supabase/tests/**/*.test.ts'], environment: 'node', testTimeout: 60000, hookTimeout: 120000, fileParallelism: false } },
    ],
  },
});
