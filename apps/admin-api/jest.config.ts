import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/__tests__/**/*.spec.ts'],
  moduleDirectories: ['node_modules', '<rootDir>/src'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@biztrack/(.*)$': '<rootDir>/../../packages/$1/src',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  collectCoverageFrom: ['<rootDir>/src/**/*.ts', '!<rootDir>/src/**/*.d.ts'],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  clearMocks: true,
}

export default config
