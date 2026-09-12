import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  type IncomeCategoryView,
  type JwtPayload,
  type OtherIncomeListResult,
  type OtherIncomeView,
} from '@biztrack/types'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { IncomeService } from './income.service'
import { CreateOtherIncomeDto } from './dto/create-other-income.dto'
import { CreateIncomeCategoryDto } from './dto/create-income-category.dto'
import { ListOtherIncomeDto } from './dto/list-other-income.dto'

/** Spec 10 ① — Other Income (non-trading income): manual entries + read of the ledger + categories. */
@ApiTags('income')
@ApiBearerAuth()
@UseGuards(Phase2Guard)
@Controller('income')
export class IncomeController {
  constructor(private readonly service: IncomeService) {}

  @Post()
  @ApiOperation({ summary: 'Record a manual other-income entry' })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateOtherIncomeDto,
  ): Promise<OtherIncomeView> {
    return this.service.create(user.businessId as string, user, dto)
  }

  @Get()
  @ApiOperation({ summary: 'List other-income entries (paginated, newest first)' })
  list(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListOtherIncomeDto,
  ): Promise<OtherIncomeListResult> {
    return this.service.list(user.businessId as string, query)
  }

  @Get('categories')
  @ApiOperation({ summary: 'List income categories (system + this business)' })
  categories(@CurrentUser() user: JwtPayload): Promise<IncomeCategoryView[]> {
    return this.service.listCategories(user.businessId as string)
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create a business income category' })
  createCategory(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateIncomeCategoryDto,
  ): Promise<IncomeCategoryView> {
    return this.service.createCategory(user.businessId as string, dto)
  }
}
