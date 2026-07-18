import { Controller, Get, Query } from '@nestjs/common'
import { RequirePermission } from '@/common/decorators/require-permission.decorator'
import { CurrentAdmin } from '@/common/decorators/current-admin.decorator'
import type { AdminJwtPayload } from '@/common/auth/admin-jwt-payload'
import { MetricsService } from './metrics.service'
import { PeriodDto } from './dto/period.dto'

@Controller({ path: 'admin/metrics', version: '1' })
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('overview')
  @RequirePermission('metrics:view')
  overview(@CurrentAdmin() admin: AdminJwtPayload) {
    const canViewRevenue = admin.isSuperAdmin || admin.permissions.includes('revenue:view')
    return this.metricsService.overview(canViewRevenue)
  }

  @Get('revenue')
  @RequirePermission('revenue:view')
  revenue(@Query() q: PeriodDto) {
    return this.metricsService.revenue(q.period ?? '30d')
  }

  @Get('revenue/breakdown')
  @RequirePermission('revenue:view')
  breakdown() {
    return this.metricsService.breakdown()
  }

  @Get('mrr-history')
  @RequirePermission('revenue:view')
  mrrHistory(@Query() q: PeriodDto) {
    return this.metricsService.mrrHistory(q.period ?? '30d')
  }
}
