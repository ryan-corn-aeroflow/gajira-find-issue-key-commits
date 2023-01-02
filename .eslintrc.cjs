const pp = 'plugin:prettier/recommended';

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
      plugins: ['html'],
      extends: ['plugin:json/recommended', 'plugin:markdown/recommended', pp],
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
      extends: ['plugin:actions/recommended', pp],
      files: ['.github/workflows/*.{yml,yaml}'],
    },
    {
      files: ['**/*.cjs'],
      plugins: ['import', 'optimize-regex'],
      extends: ['airbnb-base', 'plugin:import/errors', 'eslint:recommended', 'plugin:node/recommended', pp],
      env: { es2022: true, node: true },
      parser: '@babel/eslint-parser',
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'script',
      },
      rules: {
        'sonarjs/no-duplicate-string': 'off',
      },
    },
    {
      files: ['__tests__/**/*.js'],
      plugins: ['promise', '@babel', 'jest', 'optimize-regex', 'lodash', 'no-use-extend-native', 'editorconfig'],
      extends: [
        'plugin:node/recommended',
        'plugin:lodash/recommended',
        'eslint:recommended',
        'plugin:jest/recommended',
        'plugin:optimize-regex/recommended',
        pp,
      ],
      env: {
        'es2021': true,
        'jest': true,
        'node': true,
        'jest/globals': true,
      },

      parser: '@babel/eslint-parser',
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
      },
      rules: {
        'dot-notation': ['off', { allowKeywords: true }],
        'import/order': 'off',
        'lodash/import-scope': 'off',
        '@babel/new-cap': 'error',
        '@babel/no-invalid-this': 'error',
        '@babel/no-unused-expressions': 'error',
        '@babel/object-curly-spacing': 'off',
        '@babel/semi': 'error',
        'camelcase': 'off',
        'no-console': 'off',
        'class-methods-use-this': 'off',
        'consistent-return': 'off',
        'jest/no-hooks': 'off',
        'jest/require-hook': 'off',
        'optimize-regex/optimize-regex': 'warn',
        'semi': 'off',
      },
    },
    {
      files: ['src/**/*.js'],
      plugins: [
        'promise',
        'import',
        'optimize-regex',
        '@babel',
        'lodash',
        'no-use-extend-native',
        'sort-class-members',
        'switch-case',
        'editorconfig',
      ],
      extends: [
        'plugin:promise/recommended',
        'plugin:no-use-extend-native/recommended',
        'plugin:jest/recommended',
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:import/errors',
        'plugin:import/warnings',
        'plugin:import/typescript',
        'plugin:optimize-regex/recommended',
        'plugin:switch-case/recommended',
        'plugin:node/recommended',
        'plugin:no-use-extend-native/recommended',
        'plugin:lodash/recommended',
        'plugin:eslint-comments/recommended',
        'plugin:unicorn/recommended',
        'plugin:sonarjs/recommended',
        'airbnb-base',
        'plugin:editorconfig/all',
        pp,
      ],
      env: {
        es2021: true,
        node: true,
      },
      globals: {
        Atomics: 'readonly',
        SharedArrayBuffer: 'readonly',
      },

      parser: '@babel/eslint-parser',
      parserOptions: {
        requireConfigFile: false,
        sourceType: 'module',
        ecmaVersion: 'latest',
        ecmaFeatures: {
          impliedStrict: true,
        },
      },
      rules: {
        'no-useless-escape': 'off',
        'lodash/prop-shorthand': 'off',
        'no-await-in-loop': 'off',
        'editorconfig/indent': 'off',
        'import/order': 'off',
        'node/no-unsupported-features/es-syntax': [
          'off',
          {
            version: '>=16.10.0',
            ignores: ['dynamicImport'],
          },
        ],
        '@babel/new-cap': 'error',
        '@babel/no-invalid-this': 'error',
        '@babel/no-unused-expressions': 'error',
        '@babel/object-curly-spacing': ['error', 'always'],
        '@babel/semi': 'error',
        'camelcase': 'off',
        'class-methods-use-this': 'off',
        'consistent-return': 'off',
        'unicorn/prefer-top-level-await': 'off',
        'curly': ['error', 'all'],
        'eslint-comments/no-use': 'off',
        'github/no-then': 'off',
        'import/first': 'error',
        'import/newline-after-import': 'error',
        'import/no-duplicates': 'error',
        'import/no-namespace': 'off',
        'lodash/import-scope': 'off',
        'lodash/chaining': 'off',
        'sonarjs/no-redundant-jump': 'off',
        'no-console': 'off',
        'no-plusplus': 'off',
        'no-restricted-syntax': 'off',
        'no-undefined': 'off',
        'no-underscore-dangle': 'off',
        'no-unused-vars': 'off',
        'no-use-before-define': 'off',
        'no-useless-return': 'off',
        'object-curly-spacing': 'off',
        'optimize-regex/optimize-regex': 'warn',
        'promise/always-return': 'off',
        'security/detect-non-literal-fs-filename': 'off',
        'security/detect-non-literal-regexp': 'off',
        'security/detect-unsafe-regex': 'off',
        'semi': 'off',
        'sonarjs/cognitive-complexity': 'off',
        'sort-imports': 'off',
        'space-before-function-paren': 'off',
        'unicorn/consistent-destructuring': 'off',
        'unicorn/no-new-array': 'off',
        'unicorn/no-static-only-class': 'off',
        'sort-class-members/sort-class-members': [
          2,
          {
            order: [
              '[static-properties]',
              '[static-methods]',
              '[properties]',
              '[conventional-private-properties]',
              'constructor',
              '[methods]',
              '[conventional-private-methods]',
            ],
            accessorPairPositioning: 'getThenSet',
          },
        ],
      },
    },
    {
      files: ['./bin/*.mjs', './bin/runtime'],
      plugins: [
        'promise',
        'simple-import-sort',
        'import',
        'optimize-regex',
        '@babel',
        'sort-class-members',
        'switch-case',
      ],
      extends: [
        'plugin:promise/recommended',
        'plugin:switch-case/recommended',
        'plugin:eslint-comments/recommended',
        'plugin:import/errors',
        'plugin:unicorn/recommended',
        'plugin:sonarjs/recommended',
        'airbnb-base',
        'eslint:recommended',
        pp,
      ],
      env: {
        es2017: true,
        node: true,
      },
      globals: {
        Atomics: 'readonly',
        SharedArrayBuffer: 'readonly',
      },

      parser: '@babel/eslint-parser',
      parserOptions: {
        ecmaVersion: 2017,
        sourceType: 'module',
      },
      rules: {
        'node/no-unsupported-features/es-syntax': [
          'off',
          {
            version: '>=12.10',
            ignores: ['dynamicImport'],
          },
        ],
        'editorconfig/indent': 'off',
        'import/order': 'off',
        'unicorn/prefer-node-protocol': 'off',
        'sonarjs/no-duplicate-string': 'off',
        '@babel/new-cap': 'error',
        '@babel/no-invalid-this': 'error',
        '@babel/no-unused-expressions': 'error',
        '@babel/object-curly-spacing': ['error', 'always'],
        '@babel/semi': 'error',
        'camelcase': 'off',
        'class-methods-use-this': 'off',
        'consistent-return': 'off',
        'unicorn/prefer-top-level-await': 'off',
        'curly': ['error', 'all'],
        'eslint-comments/no-use': 'off',
        'github/no-then': 'off',
        'import/first': 'error',
        'import/newline-after-import': 'error',
        'import/no-duplicates': 'error',
        'import/no-namespace': 'off',
        'sonarjs/no-redundant-jump': 'off',
        'no-console': 'off',
        'no-plusplus': 'off',
        'no-restricted-syntax': 'off',
        'no-undefined': 'off',
        'no-underscore-dangle': 'off',
        'no-unused-vars': 'off',
        'no-use-before-define': 'off',
        'no-useless-return': 'off',
        'object-curly-spacing': 'off',
        'optimize-regex/optimize-regex': 'warn',
        'promise/always-return': 'off',
        'security/detect-non-literal-fs-filename': 'off',
        'security/detect-non-literal-regexp': 'off',
        'security/detect-unsafe-regex': 'off',
        'semi': 'off',
        'sonarjs/cognitive-complexity': 'off',
        'sort-imports': 'off',
        'space-before-function-paren': 'off',
        'unicorn/consistent-destructuring': 'off',
        'unicorn/no-new-array': 'off',
        'unicorn/no-static-only-class': 'off',
        'sort-class-members/sort-class-members': [
          2,
          {
            order: [
              '[static-properties]',
              '[static-methods]',
              '[properties]',
              '[conventional-private-properties]',
              'constructor',
              '[methods]',
              '[conventional-private-methods]',
            ],
            accessorPairPositioning: 'getThenSet',
          },
        ],
      },
    },
  ],
};
