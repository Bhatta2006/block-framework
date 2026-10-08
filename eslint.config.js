import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      '**/dist/**',
      '**/dist-ui/**',
      '**/__render_out__/**',
      '**/node_modules/**',
      '**/*.js',
      '**/*.mjs',
      '.builder-cache/**',
      '.ci-work/**',
      '.audit-work/**',
    ],
  },
  {
    // Node helper scripts (.mjs): allow Node globals.
    files: ['**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
