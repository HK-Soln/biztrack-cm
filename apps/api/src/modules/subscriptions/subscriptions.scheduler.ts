import { Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { SubscriptionsService } from './subscriptions.service'

@Injectable()
export class SubscriptionsScheduler {
  constructor(private subscriptionsService: SubscriptionsService) {}

  @Cron('0 7 * * *', { timeZone: 'Africa/Douala' })
  async checkTrialExpiry() {
    await this.subscriptionsService.expireTrials()
  }
}
