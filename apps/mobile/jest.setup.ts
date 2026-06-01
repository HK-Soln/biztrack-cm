/**
 * jest.setup.ts
 *
 * Runs ONCE before every test file.
 * Contains global mocks and polyfills needed by every test suite.
 *
 * Order matters:
 *   1. Polyfills / fetch mocking (must run before any module that calls fetch)
 *   2. Native module mocks (modules that can't run in Node/jsdom)
 *   3. Console noise suppression
 */

// ─── 1. Enable fetch mocking ─────────────────────────────────────────────────
// jest-fetch-mock replaces the global `fetch` with a controllable mock.
// In your tests:
//   fetchMock.mockResponseOnce(JSON.stringify({ nextStep: 'VERIFY_PHONE' }))
import fetchMock from 'jest-fetch-mock'
fetchMock.enableMocks()

// ─── 2. expo-sqlite ──────────────────────────────────────────────────────────
// Drizzle uses expo-sqlite under the hood; the native module cannot run in
// Node. Mock it with an in-memory no-op so stores don't crash during import.
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    execSync:        jest.fn(),
    runSync:         jest.fn(),
    getFirstSync:    jest.fn(() => null),
    getAllSync:       jest.fn(() => []),
    prepareSync:     jest.fn(() => ({
      executeSync: jest.fn(() => ({ rows: [] })),
      finalizeSync: jest.fn(),
    })),
    closeSync:       jest.fn(),
    withTransactionSync: jest.fn((fn: () => void) => fn()),
  })),
}))

// ─── 3. expo-crypto ──────────────────────────────────────────────────────────
// Used by utils/uuid.ts via generateRandomBytes. Return deterministic bytes.
jest.mock('expo-crypto', () => ({
  getRandomValues: jest.fn((buffer: Uint8Array) => {
    for (let i = 0; i < buffer.length; i++) buffer[i] = i % 256
    return buffer
  }),
  randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  digestStringAsync: jest.fn(() => Promise.resolve('mock-hash')),
}))

// ─── 4. @expo/vector-icons ───────────────────────────────────────────────────
// Font-based icon sets can't render in jsdom. Return a plain null component.
jest.mock('@expo/vector-icons', () => {
  const React = require('react')
  const Dummy = () => null
  return {
    Ionicons:     Dummy,
    MaterialIcons: Dummy,
    FontAwesome:  Dummy,
    Feather:      Dummy,
    AntDesign:    Dummy,
    Entypo:       Dummy,
    EvilIcons:    Dummy,
    Octicons:     Dummy,
  }
})

// ─── 5. react-native-safe-area-context ───────────────────────────────────────
jest.mock('react-native-safe-area-context', () => {
  const React = require('react')
  const insets = { top: 0, right: 0, bottom: 0, left: 0 }
  return {
    SafeAreaProvider:     ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView:         ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets:    () => insets,
    useSafeAreaFrame:     () => ({ x: 0, y: 0, width: 390, height: 844 }),
    SafeAreaInsetsContext: { Consumer: ({ children }: { children: (v: typeof insets) => React.ReactNode }) => children(insets) },
  }
})

// ─── 6. react-native-reanimated ──────────────────────────────────────────────
// The Babel plugin is not active in Jest; use the official mock instead.
jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock')
)

// ─── 7. expo-router ──────────────────────────────────────────────────────────
// Screens use useRouter() — give tests a controllable router object.
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push:    jest.fn(),
    replace: jest.fn(),
    back:    jest.fn(),
    navigate: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  useSegments:          () => [],
  Link:    ({ children }: { children: React.ReactNode }) => children,
  Redirect: () => null,
}))

// ─── 8. expo-constants ───────────────────────────────────────────────────────
jest.mock('expo-constants', () => ({
  default: { expoConfig: { extra: {} } },
}))

// ─── 9. Silence noisy React Native warnings ──────────────────────────────────
// These originate inside internal RN / Expo packages and pollute test output.
const originalWarn = console.warn.bind(console)
jest.spyOn(console, 'warn').mockImplementation((msg: string, ...args: unknown[]) => {
  const suppress = [
    'ViewPropTypes',
    'AsyncStorage has been extracted',
    'Animated:',
    'componentWillReceiveProps',
    'componentWillMount',
  ]
  if (suppress.some((s) => String(msg).includes(s))) return
  originalWarn(msg, ...args)
})
