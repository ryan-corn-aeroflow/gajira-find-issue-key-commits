const pp = 'plugin:prettier/recommended';
const a = 'auto';
module.exports = {
  root: true,
  overrides: [
    {
      files: ['*.yml', '*.yaml'],
      parser: 'yaml-eslint-parser',
      extends: ['plugin:yml/recommended', 'plugin:yml/prettier', pp],
    },
    {
      files: ['*.html', '*.json', '*.md'],
      extends: [a, pp],
      rules: {
        'no-plusplus': 'off',
      },
      parserOptions: {
        ecmaVersion: 'latest',
      },

      env: {
        es2022: true,
      },
    },
    {
      extends: ['plugin:actions/recommended'],
      files: ['.github/workflows/*.{yml,yaml}'],
    },
    {
      files: ['**/*.cjs'],
      plugins: ['simple-import-sort', 'import'],
      extends: ['airbnb-base', 'plugin:import/errors', 'eslint:recommended', pp],
      env: { es2022: true, node: true },
      parser: '@babel/eslint-parser',
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'script',
      },
      rules: {
        'sonarjs/no-duplicate-string': 'off',
      },
    },
    {
      files: ['__tests__/**/*.js'],
      plugins: ['simple-import-sort', 'import', 'jest'],
      extends: [
        'plugin:unicorn/recommended',
        'plugin:sonarjs/recommended',
        'airbnb-base',
        'plugin:import/errors',
        'eslint:recommended',
        'plugin:jest/all',
        pp,
      ],
      env: {
        'es2022': true,
        'jest': true,
        'node': true,
        'jest/globals': true,
      },

      parser: '@babel/eslint-parser',
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      rules: {
        'jest/no-hooks': 'off',
        'jest/require-hook': 'off',
        'class-methods-use-this': 'off',
        'camelcase': 'off',
        'consistent-return': 'off',
        'semi': 'error',
      },
    },
    {
      files: ['src/**/*.js'],
      plugins: ['simple-import-sort', 'import', 'github', pp],
      extends: [
        'plugin:unicorn/recommended',
        'plugin:sonarjs/recommended',
        'airbnb-base',
        'plugin:import/errors',
        'eslint:recommended',
        pp,
      ],
      env: {
        es2022: true,
        node: true,
      },
      globals: {
        Atomics: 'readonly',
        SharedArrayBuffer: 'readonly',
      },

      parser: '@babel/eslint-parser',
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      rules: {
        'no-undefined': 'off',
        'no-useless-return': 'off',
        'promise/always-return': 'off',
        'sonarjs/cognitive-complexity': 'off',
        'unicorn/no-new-array': 'off',
        'no-use-before-define': 'off',
        'no-underscore-dangle': 'off',
        'security/detect-non-literal-fs-filename': 'off',
        'security/detect-non-literal-regexp': 'off',
        'unicorn/no-static-only-class': 'off',
        'security/detect-unsafe-regex': 'off',
        'no-plusplus': 'off',
        'import/no-namespace': 'off',
        'no-unused-vars': 'off',
        'import/first': 'error',
        'import/newline-after-import': 'error',
        'import/no-duplicates': 'error',
        'sort-imports': 'off',
        'simple-import-sort/imports': 'error',
        'simple-import-sort/exports': 'error',
        'eslint-comments/no-use': 'off',
        'github/no-then': 'off',
        'babel/camelcase': 'off',
        'unicorn/consistent-destructuring': 'off',
        'class-methods-use-this': 'off',
        'camelcase': 'off',
        'consistent-return': 'off',
        'semi': 'error',
        'space-before-function-paren': 'off',
      },
    },
  ],
};
