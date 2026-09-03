import { PaymentMethod } from '@biztrack/types'
import { MtnAdapter } from '../adapters/mtn.adapter'

/** Route mocked fetch by URL: token vs balance. */
function mockFetch(routes: { token?: unknown; balance?: unknown }) {
  global.fetch = jest.fn((url: string) => {
    if (String(url).includes('/collection/token/')) return Promise.resolve(routes.token)
    if (String(url).includes('/collection/v1_0/account/balance'))
      return Promise.resolve(routes.balance)
    return Promise.reject(new Error(`unexpected url ${url}`))
  }) as unknown as typeof fetch
}

const ok = (json: unknown) => ({
  ok: true,
  status: 200,
  json: async () => json,
  // fetchToken reads res.text() then JSON.parses it, so text() must carry the JSON.
  text: async () => JSON.stringify(json),
})
const fail = (status: number) => ({ ok: false, status, text: async () => 'err' })

const GOOD = {
  subscription_key: 'sub',
  api_user: 'u-123456',
  api_key: 'key',
  environment: 'sandbox',
}

describe('MtnAdapter (MoMo Collection) — verifyCredentials', () => {
  const adapter = new MtnAdapter()
  const realFetch = global.fetch
  afterEach(() => {
    global.fetch = realFetch
  })

  it('rejects incomplete credentials without a network call', async () => {
    const spy = jest.fn()
    global.fetch = spy as unknown as typeof fetch
    const res = await adapter.verifyCredentials({ subscription_key: 'sub' })
    expect(res.valid).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })

  it('valid when token + Collection balance both succeed, enabling MTN_MOMO', async () => {
    mockFetch({
      token: ok({ access_token: 'tok', expires_in: 3600 }),
      balance: ok({ availableBalance: '0', currency: 'EUR' }),
    })
    const res = await adapter.verifyCredentials(GOOD)
    expect(res.valid).toBe(true)
    expect(res.enabledMethods).toContain(PaymentMethod.MTN_MOMO)
  })

  it('invalid when the token is rejected (bad api user/key or subscription key)', async () => {
    mockFetch({ token: fail(401) })
    const res = await adapter.verifyCredentials(GOOD)
    expect(res.valid).toBe(false)
  })

  it('invalid when the key is not the Collection key (token ok, balance 403)', async () => {
    mockFetch({ token: ok({ access_token: 'tok', expires_in: 3600 }), balance: fail(403) })
    const res = await adapter.verifyCredentials(GOOD)
    expect(res.valid).toBe(false)
    expect(res.error).toMatch(/Collection/i)
  })

  it('requires a base URL in production', async () => {
    const spy = jest.fn()
    global.fetch = spy as unknown as typeof fetch
    const res = await adapter.verifyCredentials({ ...GOOD, environment: 'production' })
    expect(res.valid).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })
})
