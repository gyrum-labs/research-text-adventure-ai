/*
 * Flat ESLint config.
 *
 * The rule that matters here is the kernel boundary: `src/kernel` must not
 * import from the layers that depend on it. That rule is also a test, but a
 * lint catches it while the code is being written rather than after.
 */

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['docs-viewer/**', 'dist/**', 'node_modules/**', '.vale/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'off',
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    // The kernel is a leaf. It may not reach back into the layers that use it,
    // and it has no clock, no randomness and no I/O. The only exception is
    // node:crypto, which hashes without breaking determinism.
    files: ['src/kernel/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/agents/**', '**/runner/**', '**/cli/**', '**/server/**', '**/web/**'],
              message: 'The kernel is a leaf. It cannot import from the layers above it.',
            },
            {
              group: [
                'node:fs',
                'node:fs/*',
                'node:http',
                'node:https',
                'node:os',
                'node:path',
                'node:child_process',
                'node:worker_threads',
              ],
              message:
                'The kernel is pure. It has no clock, no randomness and no I/O, so the same commands produce the same state every time.',
            },
          ],
        },
      ],
    },
  },
);
