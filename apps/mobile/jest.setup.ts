/**
 * jest.setup.ts
 *
 * This file runs ONCE before every test file.
 * Put global mocks and polyfills here — anything every test needs.
 */

// ─── 1. Enable fetch mocking ─────────────────────────────────────────────────
// jest-fetch-mock replaces the global `fetch` with a controllable mock.
// In your tests you can do:
//   fetchMock.mockResponseOnce(JSON.stringify({ nextStep: 'VERIFY_PHONE' }))
import fetchMock from 'jest-fetch-mock'
fetchMock.enableMocks()

// ─── 2. Silence noisy React Native warnings ──────────────────────────────────
// These come from internal RN components and add noise to test output.
// Remove any you actually want to see.
const originalWarn = console.warn.bind(console)

jest.spyOn(console, 'warn').mockImplementation((msg: string) => {
  const suppress = [
    'ViewPropTypes',
    'AsyncStorage has been extracted',
    'Animated:',
  ]
  if (suppress.some((s) => String(msg).includes(s))) return
  originalWarn(msg)
})

// ─── 3. Mock expo-router ─────────────────────────────────────────────────────
// Screens use useRouter() — this gives tests a controllable router object.
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  Link: ({ children }: { children: React.ReactNode }) => children,
}))

// ─── 4. Mock expo-constants ──────────────────────────────────────────────────
jest.mock('expo-constants', () => ({
  default: { expoConfig: { extra: {} } },
}))
