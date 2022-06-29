// jest.config.js
// require('nock').disableNetConnect()

module.exports = {
  clearMocks: true,
  moduleFileExtensions: ['js'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  testRunner: 'jest-circus/runner',
  reporters: ['default', 'jest-junit'],
  verbose: true,
  setupFiles: ['dotenv/config'],
  bail: false,
  testPathIgnorePatterns: ['/helpers/', '/node_modules/'],
  coveragePathIgnorePatterns: ['/node_modules/'],
  coverageReporters: ['lcov', 'text', 'clover'],
  coverageDirectory: '../test-results',
};
