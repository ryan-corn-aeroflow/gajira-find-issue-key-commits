// Sync object
const config = {
  clearMocks: true,
  maxWorkers: 2,
  rootDir: '.',
  moduleFileExtensions: ['js', 'ts'],
  testEnvironment: 'node',
  testMatch: ['**/__tests__/*.test.ts'],
  testRunner: 'jest-circus/runner',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  setupFiles: ['dotenv/config'],
  reporters: ['default', 'jest-junit'],

  verbose: true,
  testPathIgnorePatterns: ['/helpers/', '/node_modules/'],
  coveragePathIgnorePatterns: ['/node_modules/'],
  coverageReporters: ['lcov', 'text', 'clover'],
  coverageDirectory: './test-results',
};

module.exports = config;
