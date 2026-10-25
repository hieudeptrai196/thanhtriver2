import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['public/sw.js'],
    languageOptions: { globals: { self: 'readonly', caches: 'readonly', fetch: 'readonly', URL: 'readonly' } },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { Buffer: 'readonly', console: 'readonly', process: 'readonly' } },
  },
  {
    // Trailer director: runs inside the game page.
    files: ['tools/trailer/director.js'],
    languageOptions: {
      globals: { window: 'readonly', document: 'readonly', location: 'readonly', fetch: 'readonly', setInterval: 'readonly', clearInterval: 'readonly' },
    },
  },
  {
    files: ['tools/**/*.mjs'],
    languageOptions: { globals: { Buffer: 'readonly', console: 'readonly', process: 'readonly', URL: 'readonly' } },
  },
  {
    files: ['src/sim/**/*.ts', 'src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['three', 'three/*', '../render/*', '../ui/*', '../input/*'] }],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage'],
    },
  },
);
