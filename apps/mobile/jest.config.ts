import type { Config } from 'jest'

const config: Config = {
  // jest-expo preset handles React Native transforms, mocks, and the right
  // test environment (jsdom for web, node for native logic).
  preset: 'jest-expo',

  // Run this file before every test suite to configure global mocks
  setupFilesAfterEnv: ['./jest.setup.ts'],

  // Teach Jest about your TypeScript path aliases (mirrors tsconfig.json paths)
  moduleNameMapper: {
    // Workspace packages
    '^@biztrack/types$': '<rootDir>/../../packages/types/src',
    '^@biztrack/utils$': '<rootDir>/../../packages/utils/src',
    '^@biztrack/validators$': '<rootDir>/../../packages/validators/src',

    // Internal alias
    '^@/(.*)$': '<rootDir>/src/$1',

    // Mock AsyncStorage (avoids native module errors in Jest)
    '^@react-native-async-storage/async-storage$':
      '@react-native-async-storage/async-storage/jest/async-storage-mock',
  },

  // Only look for tests inside src/
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.{ts,tsx}'],

  // Collect coverage only from your source files (not generated/node_modules)
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/**/index.ts',        // barrel files — no logic to test
    '!src/app/_layout.tsx',    // entry layout — too integration-heavy
  ],

  // jest-expo's preset already handles react-native/expo transforms.
  // We add .pnpm support since pnpm symlinks everything into node_modules/.pnpm
  // and we add our monorepo packages (@biztrack) so they get compiled too.
  transformIgnorePatterns: [
    'node_modules/(?!((?:.*\\.pnpm/.*)?(?:(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@biztrack/.*)))',
  ],
}

export default config
