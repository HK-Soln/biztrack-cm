import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common'
import { RequirePermission } from '@/common/decorators/require-permission.decorator'
import { AuditAction } from '@/common/decorators/audit-action.decorator'
import { SubscriptionsService } from './subscriptions.service'
import { SubscriptionFiltersDto } from './dto/subscription-filters.dto'
import { UpdateSubscriptionDto } from './dto/update-subscription.dto'

@Controller({ path: 'admin/subscriptions', version: '1' })
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  @RequirePermission('subscriptions:view')
  list(@Query() filters: SubscriptionFiltersDto) {
    return this.subscriptionsService.list(filters)
  }

  @Get('trials')
  @RequirePermission('subscriptions:view')
  trials() {
    return this.subscriptionsService.trials()
  }

  @Patch(':businessId')
  @RequirePermission('subscriptions:edit')
  @AuditAction('SUBSCRIPTION_UPDATED')
  update(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.subscriptionsService.update(businessId, dto)
  }
}
