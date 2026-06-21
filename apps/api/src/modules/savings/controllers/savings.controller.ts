import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { DepositStatement, JwtPayload, PaginatedResult } from '@biztrack/types'
import { Resource } from '@biztrack/types'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { RequireResource, ResourceGuard } from '@/modules/permissions/guards/resource.guard'
import type { CustomerDeposit } from '@/entities/customer-deposit.entity'
import { AddDepositPaymentDto, CloseDepositDto, CreateDepositDto, ListDepositsQueryDto } from '../dto/deposit.dto'
import { DepositsService } from '../services/savings.service'

@ApiTags('Deposits')
@ApiBearerAuth()
@UseGuards(Phase2Guard, ResourceGuard)
@Controller('deposits')
export class SavingsController {
  constructor(private readonly depositsService: DepositsService) {}

  @Post()
  @RequireResource(Resource.DEPOSITS)
  @ApiOperation({ summary: 'Open a deposit session' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateDepositDto): Promise<CustomerDeposit> {
    return this.depositsService.create(user.businessId as string, user, dto)
  }

  @Get()
  @RequireResource(Resource.DEPOSITS)
  @ApiOperation({ summary: 'List deposit sessions' })
  list(@CurrentUser() user: JwtPayload, @Query() query: ListDepositsQueryDto): Promise<PaginatedResult<CustomerDeposit>> {
    return this.depositsService.list(user.businessId as string, query)
  }

  @Get('open/:customerId')
  @RequireResource(Resource.DEPOSITS)
  @ApiOperation({ summary: "A customer's open deposit session (or null)" })
  getOpen(@CurrentUser() user: JwtPayload, @Param('customerId') customerId: string): Promise<CustomerDeposit | null> {
    return this.depositsService.getOpenForCustomer(customerId, user.businessId as string)
  }

  @Get(':id')
  @RequireResource(Resource.DEPOSITS)
  @ApiOperation({ summary: 'Get a deposit session' })
  get(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<CustomerDeposit> {
    return this.depositsService.findById(id, user.businessId as string)
  }

  @Get(':id/statement')
  @RequireResource(Resource.DEPOSITS)
  @ApiOperation({ summary: 'Deposit session statement' })
  statement(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<DepositStatement> {
    return this.depositsService.getStatement(id, user.businessId as string)
  }

  @Post(':id/payments')
  @RequireResource(Resource.DEPOSITS)
  @ApiOperation({ summary: 'Add a deposit (top-up) to a session' })
  addPayment(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: AddDepositPaymentDto): Promise<CustomerDeposit> {
    return this.depositsService.addPayment(id, user.businessId as string, user, dto)
  }

  @Post(':id/close')
  @RequireResource(Resource.DEPOSITS)
  @ApiOperation({ summary: 'Close a session (settle leftover, set outcome)' })
  close(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: CloseDepositDto): Promise<CustomerDeposit> {
    return this.depositsService.close(id, user.businessId as string, user, dto)
  }
}
