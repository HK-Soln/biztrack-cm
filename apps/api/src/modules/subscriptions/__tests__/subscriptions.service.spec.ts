/// <reference types="jest" />
import { FindOperator } from 'typeorm'
import { SubscriptionPlan } from '@biztrack/types'
import { SubscriptionStatus } from '@/entities/business.entity'
import { SubscriptionEventType } from '@/entities/subscription-event.entity'
import { SubscriptionsService } from '../subscriptions.service'

const makeService = () => {
  const businessesRepo = {
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
  }
  const subscriptionEventsRepo = {
    createOne: jest.fn(),
  }
  const permissionsService = {
    invalidateCache: jest.fn(),
  }

  const service = new SubscriptionsService(
    businessesRepo as any,
    subscriptionEventsRepo as any,
    permissionsService as any,
  )

  return { service, businessesRepo, subscriptionEventsRepo, permissionsService }
}

describe('SubscriptionsService', () => {
  describe('expireTrials', () => {
    it('queries with real TypeORM comparison operators (regression: was Prisma-style {lt}/{not})', async () => {
      const { service, businessesRepo } = makeService()

      await service.expireTrials()

      expect(businessesRepo.find).toHaveBeenCalledTimes(1)
      const where = businessesRepo.find.mock.calls[0][0].where

      // Plain objects ({ lt: now }) silently match nothing in TypeORM — these must be FindOperators.
      expect(where.subscriptionStatus).toBe(SubscriptionStatus.TRIAL)
      expect(where.trialEndsAt).toBeInstanceOf(FindOperator)
      expect((where.trialEndsAt as FindOperator<Date>).type).toBe('lessThan')
      expect(where.plan).toBeInstanceOf(FindOperator)
      expect((where.plan as FindOperator<SubscriptionPlan>).type).toBe('not')
      expect((where.plan as FindOperator<SubscriptionPlan>).value).toBe(SubscriptionPlan.FREE)
    })

    it('downgrades each expired trial to FREE/ACTIVE, invalidates cache, and records an event', async () => {
      const { service, businessesRepo, subscriptionEventsRepo, permissionsService } = makeService()
      businessesRepo.find.mockResolvedValue([{ id: 'biz-1', plan: SubscriptionPlan.BUSINESS }])

      await service.expireTrials()

      expect(businessesRepo.update).toHaveBeenCalledWith('biz-1', {
        plan: SubscriptionPlan.FREE,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      })
      expect(permissionsService.invalidateCache).toHaveBeenCalledWith('biz-1')
      expect(subscriptionEventsRepo.createOne).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId: 'biz-1',
          event: SubscriptionEventType.TRIAL_ENDED,
          fromPlan: SubscriptionPlan.BUSINESS,
          toPlan: SubscriptionPlan.FREE,
        }),
      )
    })

    it('does nothing when no trials are expired', async () => {
      const { service, businessesRepo, subscriptionEventsRepo } = makeService()

      await service.expireTrials()

      expect(businessesRepo.update).not.toHaveBeenCalled()
      expect(subscriptionEventsRepo.createOne).not.toHaveBeenCalled()
    })
  })
})
