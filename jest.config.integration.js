/** @type {import('jest').Config} */
module.exports = {
  displayName: 'Integration Tests',
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/__tests__/integration/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/src/__tests__/unit/'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/__tests__/**', '!src/index.ts'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/integration/setup.ts'],
  testTimeout: 30000, // 30 seconds for integration tests
  maxWorkers: 2, // Limit parallelism for integration tests
  bail: false, // Continue running tests after first failure
  verbose: true,
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: './test-results',
        outputName: 'integration-results.xml',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathForSuiteName: true,
      },
    ],
  ],
  // Module resolution for .js extensions
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          allowJs: true,
          esModuleInterop: true,
        },
      },
    ],
  },
  // Global test setup
  globalSetup: '<rootDir>/src/__tests__/integration/global-setup.ts',
  globalTeardown: '<rootDir>/src/__tests__/integration/global-teardown.ts',
};
