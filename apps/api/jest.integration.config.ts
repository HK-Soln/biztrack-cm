import type { Config } from 'jest'

// Integration tests: the real services against a real Postgres (see
// src/testing/integration-database.ts). Kept out of the unit run — they need a database
// and are slower. Run with `pnpm run test:integration`.
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/__integration__/**/*.int-spec.ts'],
  moduleDirectories: ['node_modules', '<rootDir>/src'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@biztrack/(.*)$': '<rootDir>/../../packages/$1/src',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.integration.json' }],
  },
  // The first test applies every migration to a fresh database.
  testTimeout: 180_000,
  clearMocks: true,
}

export default config
