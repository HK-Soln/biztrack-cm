import { createHmac } from 'node:crypto'
import { PaymentMethod } from '@biztrack/types'
import { StripeAdapter } from '../adapters/stripe.adapter'

/** Build a valid Stripe-Signature header for a payload + secret at time `t` (unix seconds). */
function sign(payload: string, secret: string, t: number): string {
  const v1 = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')
  return `t=${t},v1=${v1}`
}

describe('StripeAdapter', () => {
  const adapter = new StripeAdapter()
  const secret = 'whsec_test_secret'
  const now = () => Math.floor(Date.now() / 1000)

  describe('verifyWebhookSignature', () => {
    const payload = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' })
    const body = Buffer.from(payload)
    const creds = { webhook_signing_secret: secret }

    it('accepts a valid, fresh signature', () => {
      const header = sign(payload, secret, now())
      expect(adapter.verifyWebhookSignature(body, { 'stripe-signature': header }, creds)).toBe(true)
    })

    it('rejects a tampered body', () => {
      const header = sign(payload, secret, now())
      const tampered = Buffer.from(payload.replace('succeeded', 'payment_failed'))
      expect(adapter.verifyWebhookSignature(tampered, { 'stripe-signature': header }, creds)).toBe(
        false,
      )
    })

    it('rejects a stale timestamp (replay)', () => {
      const header = sign(payload, secret, now() - 10_000)
      expect(adapter.verifyWebhookSignature(body, { 'stripe-signature': header }, creds)).toBe(
        false,
      )
    })

    it('rejects a signature made with the wrong secret', () => {
      const header = sign(payload, 'whsec_other', now())
      expect(adapter.verifyWebhookSignature(body, { 'stripe-signature': header }, creds)).toBe(
        false,
      )
    })

    it('returns false when no signing secret is configured', () => {
      const header = sign(payload, secret, now())
      expect(adapter.verifyWebhookSignature(body, { 'stripe-signature': header }, {})).toBe(false)
    })

    it('returns false when the header is missing', () => {
      expect(adapter.verifyWebhookSignature(body, {}, creds)).toBe(false)
    })
  })

  describe('parseWebhook', () => {
    it('maps a succeeded PaymentIntent to CONFIRMED with the intent ref + amount', () => {
      const event = {
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123', amount_received: 5000, currency: 'xaf' } },
      }
      const parsed = adapter.parseWebhook(Buffer.from(JSON.stringify(event)))
      expect(parsed).toMatchObject({
        providerRef: 'pi_123',
        status: 'CONFIRMED',
        amountMinor: 5000,
        currency: 'XAF',
        eventId: 'evt_123',
      })
    })

    it('prefers the payment_intent ref on a charge event and maps failure to FAILED', () => {
      const event = {
        id: 'evt_456',
        type: 'charge.failed',
        data: { object: { id: 'ch_1', payment_intent: 'pi_456', amount: 200, currency: 'usd' } },
      }
      const parsed = adapter.parseWebhook(Buffer.from(JSON.stringify(event)))
      expect(parsed.providerRef).toBe('pi_456')
      expect(parsed.status).toBe('FAILED')
      expect(parsed.currency).toBe('USD')
    })

    it('maps an unrelated event to PENDING (its ref will not match a live attempt)', () => {
      const event = { id: 'evt_9', type: 'customer.created', data: { object: { id: 'cus_9' } } }
      const parsed = adapter.parseWebhook(Buffer.from(JSON.stringify(event)))
      expect(parsed.status).toBe('PENDING')
    })
  })

  describe('verifyCredentials + getTransaction (mocked Stripe API)', () => {
    const realFetch = global.fetch
    afterEach(() => {
      global.fetch = realFetch
    })
    const mockFetch = (impl: (url: string) => unknown) => {
      global.fetch = jest.fn((url: string) => Promise.resolve(impl(url))) as unknown as typeof fetch
    }

    it('rejects a missing secret key without a network call', async () => {
      const spy = jest.fn()
      global.fetch = spy as unknown as typeof fetch
      const res = await adapter.verifyCredentials({})
      expect(res.valid).toBe(false)
      expect(spy).not.toHaveBeenCalled()
    })

    it('treats a 401 as an invalid key', async () => {
      mockFetch(() => ({ ok: false, status: 401, text: async () => 'Unauthorized' }))
      const res = await adapter.verifyCredentials({ secret_key: 'rk_bad' })
      expect(res.valid).toBe(false)
    })

    it('accepts a 200, enabling CARD and capturing the account ref', async () => {
      mockFetch(() => ({ ok: true, status: 200, json: async () => ({ id: 'acct_1' }) }))
      const res = await adapter.verifyCredentials({ secret_key: 'rk_good' })
      expect(res.valid).toBe(true)
      expect(res.enabledMethods).toContain(PaymentMethod.CARD)
      expect(res.accountRef).toBe('acct_1')
    })

    it('accepts a 403 (authenticated but scoped) as a valid key', async () => {
      mockFetch(() => ({ ok: false, status: 403, text: async () => 'Forbidden' }))
      const res = await adapter.verifyCredentials({ secret_key: 'rk_scoped' })
      expect(res.valid).toBe(true)
    })

    it('polls a PaymentIntent and maps status', async () => {
      mockFetch(() => ({
        ok: true,
        status: 200,
        json: async () => ({ id: 'pi_1', status: 'succeeded', amount: 1500, currency: 'xaf' }),
      }))
      const state = await adapter.getTransaction({ secret_key: 'rk_good' }, 'pi_1')
      expect(state).toMatchObject({ status: 'CONFIRMED', providerRef: 'pi_1', amountMinor: 1500 })
    })
  })
})
