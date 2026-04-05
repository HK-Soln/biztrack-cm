import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import type { JwtPayload } from '@biztrack/types'
import { PlansService } from './plans.service'
import { SelectPlanDto } from './dto/select-plan.dto'
import { UpgradePlanDto } from './dto/upgrade-plan.dto'
import { RequireOnboardingStep, OnboardingGuard } from '@/common/guards/onboarding.guard'
import { OnboardingStep } from '@/entities/user.entity'

@ApiTags('Plans')
@ApiBearerAuth()
@UseGuards(Phase2Guard)
@Controller('plans')
export class PlansController {
  constructor(private plansService: PlansService) {}

  @Get()
  @ApiOperation({ summary: 'List available plans' })
  getPlans(@CurrentUser() user: JwtPayload) {
    return this.plansService.listPlans(user.businessId as string)
  }

  @Post('select')
  @UseGuards(OnboardingGuard)
  @RequireOnboardingStep(OnboardingStep.SELECT_PLAN)
  @ApiOperation({ summary: 'Select a plan' })
  selectPlan(@CurrentUser() user: JwtPayload, @Body() dto: SelectPlanDto) {
    return this.plansService.selectPlan(user.businessId as string, dto.plan)
  }

  @Get('my-subscription')
  @ApiOperation({ summary: 'Get current subscription' })
  mySubscription(@CurrentUser() user: JwtPayload) {
    return this.plansService.mySubscription(user.businessId as string)
  }

  @Post('upgrade')
  @ApiOperation({ summary: 'Upgrade or downgrade plan' })
  upgradePlan(@CurrentUser() user: JwtPayload, @Body() dto: UpgradePlanDto) {
    return this.plansService.upgradePlan(user.businessId as string, dto.plan)
  }

  @Post('cancel')
  @ApiOperation({ summary: 'Cancel subscription at period end' })
  cancelPlan(@CurrentUser() user: JwtPayload) {
    return this.plansService.cancelPlan(user.businessId as string)
  }
}
