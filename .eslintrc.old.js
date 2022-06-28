module.exports = {
  "root": true,
  "ignorePatterns": [
    "projects/**/*"
  ],
  "overrides": [{
  files: ['*.js'],
  env: {
    es2021: true,
    node: true,
  },
  plugins: [
    "sort-class-members",
    "simple-import-sort",
    "import"],
  extends: [
    'airbnb-base',
    "plugin:prettier/recommended",
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    "no-unused-vars": "off",
    "simple-import-sort/imports": "error",
    "simple-import-sort/exports": "error",
    "import/first": "error",
    "import/newline-after-import": "error",
    "import/no-absolute-path": "error",
    "import/no-duplicates": "error",
    "import/extensions": "off",
    'class-methods-use-this': "off",
    'no-plusplus': "off",
    'no-param-reassign': "off",
    'no-await-in-loop': "off",
  'consistent-return': "off",
  },
  }],
};
