import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/kernel/**/*.ts', 'src/runner/**/*.ts', 'src/agents/**/*.ts'],
      // types.ts holds only types and index.ts only re-exports. Neither has
      // runtime behaviour to cover.
      exclude: ['src/kernel/types.ts', 'src/kernel/index.ts'],
      thresholds: { lines: 90, functions: 90, branches: 80, statements: 90 },
    },
  },
});
