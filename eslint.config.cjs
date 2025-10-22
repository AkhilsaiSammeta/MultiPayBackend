// Flat config for ESLint v9+
// Adapts our existing .eslintrc rules using FlatCompat.

const { FlatCompat } = require('@eslint/eslintrc');
const js = require('@eslint/js');
const compat = new FlatCompat({ baseDirectory: __dirname });

module.exports = [
  // Ignore build output and deps
  { ignores: ['dist/**', 'node_modules/**'] },

  // Base JS recommended
  js.configs.recommended,

  // Convert our legacy config
  ...compat.config({
    parser: '@typescript-eslint/parser',
    parserOptions: {
      project: ['./tsconfig.json'],
      sourceType: 'module'
    },
    env: { node: true, es2021: true },
    plugins: ['@typescript-eslint'],
    extends: ['plugin:@typescript-eslint/recommended', 'prettier'],
    rules: {
      // Allow passing async handlers to Express (wrapped) without flagging void returns
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'warn'
    }
  }),

  // Loosen rules for type declaration files
  {
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off'
    }
  }
];
