/**
 * apiClient unit tests
 *
 * These test the fetch wrapper in isolation — no real network calls.
 * fetchMock (enabled in jest.setup.ts) intercepts every fetch() call.
 */
import fetchMock from 'jest-fetch-mock'
import { apiClient, ApiError } from '../apiClient'

// ─── Mock the Zustand auth store ─────────────────────────────────────────────
// We control what the store returns so tests don't depend on real state.
const mockGetState = jest.fn()
jest.mock('../../store/useAuthStore', () => ({
  useAuthStore: { getState: () => mockGetState() },
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────
const mockStore = (overrides: object = {}) =>
  mockGetState.mockReturnValue({
    accessToken: null,
    refreshToken: null,
    locale: 'fr',
    setTokens: jest.fn(),
    logout: jest.fn(),
    ...overrides,
  })

beforeEach(() => {
  fetchMock.resetMocks()
  mockStore() // default: unauthenticated
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('apiClient', () => {
  // 1.1
  it('GET request hits the correct URL', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ plans: [] }))
    await apiClient.get('/plans')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/plans'),
      expect.objectContaining({ method: 'GET' })
    )
  })

  // 1.2
  it('POST sends JSON body with correct Content-Type', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ nextStep: 'VERIFY_PHONE' }))
    await apiClient.post('/auth/register', { name: 'Alice' })
    const [, options] = fetchMock.mock.calls[0]
    expect(options?.headers).toMatchObject({ 'Content-Type': 'application/json' })
    expect(options?.body).toBe(JSON.stringify({ name: 'Alice' }))
  })

  // 1.3
  it('injects Bearer token when store has accessToken', async () => {
    mockStore({ accessToken: 'my-token' })
    fetchMock.mockResponseOnce(JSON.stringify({}))
    await apiClient.get('/profile')
    const [, options] = fetchMock.mock.calls[0]
    expect(options?.headers).toMatchObject({ Authorization: 'Bearer my-token' })
  })

  // 1.4
  it('sends NO Authorization header when unauthenticated', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({}))
    await apiClient.get('/plans')
    const [, options] = fetchMock.mock.calls[0]
    expect((options?.headers as Record<string, string>)?.Authorization).toBeUndefined()
  })

  // 1.5
  it('appends locale as query param when unauthenticated', async () => {
    mockStore({ locale: 'fr', accessToken: null })
    fetchMock.mockResponseOnce(JSON.stringify({}))
    await apiClient.get('/plans')
    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('locale=fr')
  })

  // 1.6
  it('returns parsed JSON on 200', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ nextStep: 'VERIFY_PHONE' }))
    const result = await apiClient.post('/auth/register', {})
    expect(result).toEqual({ nextStep: 'VERIFY_PHONE' })
  })

  // 1.7
  it('throws ApiError on 4xx', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ message: 'Bad request' }), { status: 400 })
    await expect(apiClient.post('/auth/register', {})).rejects.toBeInstanceOf(ApiError)
  })

  it('ApiError carries the correct status code', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ message: 'Not found' }), { status: 404 })
    try {
      await apiClient.get('/missing')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(404)
    }
  })

  // 1.8
  it('returns null on 204 No Content', async () => {
    fetchMock.mockResponseOnce('', { status: 204 })
    const result = await apiClient.post('/auth/logout', {})
    expect(result).toBeNull()
  })

  // 1.10
  it('calls logout and throws when the refresh endpoint itself returns 401', async () => {
    const logoutFn = jest.fn()
    mockStore({ accessToken: 'expired', refreshToken: 'rt', logout: logoutFn })

    // First call: 401 on the refresh endpoint directly
    fetchMock.mockResponseOnce('{}', { status: 401 })

    await expect(apiClient.post('/auth/refresh', { refreshToken: 'rt' })).rejects.toBeInstanceOf(
      ApiError
    )
    expect(logoutFn).toHaveBeenCalled()
  })

  // 1.11
  it('calls logout immediately when there is no refreshToken on 401', async () => {
    const logoutFn = jest.fn()
    mockStore({ accessToken: 'expired', refreshToken: null, logout: logoutFn })

    fetchMock.mockResponseOnce('{}', { status: 401 })

    await expect(apiClient.get('/profile')).rejects.toBeInstanceOf(ApiError)
    expect(logoutFn).toHaveBeenCalled()
  })

  // 1.12 — new: malformed refresh payload must not persist garbage tokens
  it('calls logout and throws ApiError when refresh body has no tokens', async () => {
    const setTokensFn = jest.fn()
    const logoutFn = jest.fn()
    mockStore({
      accessToken: 'expired',
      refreshToken: 'valid-rt',
      setTokens: setTokensFn,
      logout: logoutFn,
    })

    // 1st fetch: 401 on the original request
    fetchMock.mockResponseOnce('{}', { status: 401 })
    // 2nd fetch (refresh): 200 but body is missing the token fields
    fetchMock.mockResponseOnce(JSON.stringify({ success: true, data: {} }), { status: 200 })

    await expect(apiClient.get('/profile')).rejects.toBeInstanceOf(ApiError)
    expect(setTokensFn).not.toHaveBeenCalled() // must NOT persist garbage
    expect(logoutFn).toHaveBeenCalled()         // must force logout
  })

  // 1.13 — new: NestJS { success, data } envelope is correctly unwrapped
  it('unwraps { success, data } envelope and retries with new token', async () => {
    const setTokensFn = jest.fn()
    mockStore({
      accessToken: 'expired',
      refreshToken: 'valid-rt',
      setTokens: setTokensFn,
      logout: jest.fn(),
    })

    // 1st fetch: 401
    fetchMock.mockResponseOnce('{}', { status: 401 })
    // 2nd fetch (refresh): 200 with wrapped envelope
    fetchMock.mockResponseOnce(
      JSON.stringify({ success: true, data: { accessToken: 'new-at', refreshToken: 'new-rt' } }),
      { status: 200 }
    )
    // 3rd fetch: the retried original request succeeds
    fetchMock.mockResponseOnce(JSON.stringify({ ok: true }))

    await apiClient.get('/profile')
    expect(setTokensFn).toHaveBeenCalledWith('new-at', 'new-rt')
  })
})
