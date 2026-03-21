module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/__tests__/setup/env.js'],
  globalSetup: '<rootDir>/__tests__/setup/globalSetup.js',
  globalTeardown: '<rootDir>/__tests__/setup/globalTeardown.js',
  testMatch: ['**/__tests__/**/*.test.js'],
  testTimeout: 30000,
  verbose: true,
  forceExit: true,
  collectCoverageFrom: [
    'routes/**/*.js',
    'middleware/**/*.js',
    '!**/node_modules/**',
  ],
  coverageDirectory: 'coverage',
};
