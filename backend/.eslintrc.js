module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: { project: 'tsconfig.json', tsconfigRootDir: __dirname, sourceType: 'module' },
  plugins: ['@typescript-eslint', 'security', 'import', 'prettier'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:security/recommended-legacy',
    'plugin:import/typescript',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: { node: true, jest: true },
  ignorePatterns: ['.eslintrc.js', 'dist/**', 'node_modules/**'],
  rules: {
    'no-console': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    // `_`-prefixed params are allowed for contract stubs awaiting implementation.
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    'import/no-cycle': 'error',
    'prettier/prettier': 'error',
  },
  settings: { 'import/resolver': { node: { extensions: ['.ts', '.js'] } } },
};
