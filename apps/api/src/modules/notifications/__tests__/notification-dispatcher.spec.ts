import { NotificationChannel, NotificationType } from '@biztrack/types'
import {
  NotificationDispatcher,
  withinQuietHours,
} from '../services/notification-dispatcher.service'

const IN_APP = NotificationChannel.IN_APP
const EMAIL = NotificationChannel.EMAIL
const WHATSAPP = NotificationChannel.WHATSAPP

describe('withinQuietHours', () => {
  const at = (h: number, m = 0) => new Date(2026, 0, 1, h, m)

  it('handles a wrap-around window (21:00–07:00)', () => {
    const q = { from: '21:00', until: '07:00' }
    expect(withinQuietHours(q, at(23))).toBe(true)
    expect(withinQuietHours(q, at(3))).toBe(true)
    expect(withinQuietHours(q, at(12))).toBe(false)
  })

  it('handles a same-day window (09:00–17:00)', () => {
    const q = { from: '09:00', until: '17:00' }
    expect(withinQuietHours(q, at(12))).toBe(true)
    expect(withinQuietHours(q, at(8))).toBe(false)
  })
})

describe('NotificationDispatcher', () => {
  const make = (plan: unknown) => {
    const settings = { resolvePlan: jest.fn().mockResolvedValue(plan) }
    const notifications = {
      createInApp: jest.fn().mockResolvedValue(undefined),
      createAndEnqueue: jest.fn().mockResolvedValue(undefined),
    }
    const logger = { log: jest.fn() }
    const dispatcher = new NotificationDispatcher(
      settings as never,
      notifications as never,
      logger as never,
    )
    return { dispatcher, notifications }
  }
  const base = {
    businessId: 'biz',
    event: NotificationType.LOW_STOCK,
    title: 't',
    body: 'b',
  }

  it('routes in-app + verified email/whatsapp, and never SMS', async () => {
    const { dispatcher, notifications } = make({
      channels: [IN_APP, EMAIL, WHATSAPP],
      quietHours: { enabled: false, from: '21:00', until: '07:00' },
      recipients: [
        {
          userId: 'u1',
          email: 'a@b.cm',
          phone: '+237600000000',
          emailVerified: true,
          phoneVerified: true,
        },
      ],
    })
    await dispatcher.dispatch(base)
    expect(notifications.createInApp).toHaveBeenCalledTimes(1)
    const channels = notifications.createAndEnqueue.mock.calls.map((c) => c[0].channel)
    expect(channels).toEqual(expect.arrayContaining([EMAIL, WHATSAPP]))
    expect(channels).not.toContain(NotificationChannel.SMS)
  })

  it('skips unverified email and missing phone', async () => {
    const { dispatcher, notifications } = make({
      channels: [EMAIL, WHATSAPP],
      quietHours: { enabled: false, from: '21:00', until: '07:00' },
      recipients: [
        { userId: 'u1', email: 'a@b.cm', phone: null, emailVerified: false, phoneVerified: false },
      ],
    })
    await dispatcher.dispatch(base)
    expect(notifications.createAndEnqueue).not.toHaveBeenCalled()
  })

  it('holds external channels during quiet hours (in-app still recorded); urgent bypasses', async () => {
    const plan = {
      channels: [IN_APP, EMAIL],
      quietHours: { enabled: true, from: '00:00', until: '23:59' }, // always quiet → deterministic hold
      recipients: [
        { userId: 'u1', email: 'a@b.cm', phone: null, emailVerified: true, phoneVerified: false },
      ],
    }
    const { dispatcher, notifications } = make(plan)

    await dispatcher.dispatch(base)
    expect(notifications.createInApp).toHaveBeenCalledTimes(1)
    expect(notifications.createAndEnqueue).not.toHaveBeenCalled()

    await dispatcher.dispatch({ ...base, urgent: true })
    expect(notifications.createAndEnqueue).toHaveBeenCalledTimes(1)
  })
})
