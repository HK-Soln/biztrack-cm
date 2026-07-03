import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type {
  Expense,
  ExpenseCategoryRangeItem,
  ExpenseListItem,
  ExpenseListResult,
  ExpenseMonthlyRangeItem,
  ExpenseMonthlySummary,
  ExpensePnlSummary,
  JwtPayload,
} from '@biztrack/types'
import { Resource } from '@biztrack/types'
import { serializeDto, serializeDtos } from '@/common/http/serialization'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { RequireResource, ResourceGuard } from '@/modules/permissions/guards/resource.guard'
import { CreateExpenseDto } from '../dto/create-expense.dto'
import {
  ExpenseCategoryRangeItemDto,
  ExpenseListItemDto,
  ExpenseMonthlyRangeItemDto,
  ExpenseMonthlySummaryDto,
  ExpensePnlSummaryDto,
  ExpenseResponseDto,
} from '../dto/expense-response.dto'
import { ListExpensesQueryDto } from '../dto/list-expenses-query.dto'
import { MonthlyExpenseSummaryQueryDto } from '../dto/monthly-expense-summary-query.dto'
import { PnlSummaryQueryDto } from '../dto/pnl-summary-query.dto'
import { RangeExpenseSummaryQueryDto } from '../dto/range-expense-summary-query.dto'
import { UpdateExpenseDto } from '../dto/update-expense.dto'
import { ExpensesService, type ExpenseSummaryCard, type ExpenseTrendItem } from '../services/expenses.service'

@ApiTags('Expenses')
@ApiBearerAuth()
@UseGuards(Phase2Guard, ResourceGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @RequireResource(Resource.EXPENSES_CREATE)
  @ApiOperation({ summary: 'Create an expense' })
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateExpenseDto): Promise<Expense> {
    return serializeDto(
      ExpenseResponseDto.fromEntity(
        await this.expensesService.create(user.businessId as string, user, dto),
      )!,
    )
  }

  @Get()
  @RequireResource(Resource.EXPENSES_VIEW)
  @ApiOperation({ summary: 'List expenses' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListExpensesQueryDto,
  ): Promise<ExpenseListResult> {
    const result = await this.expensesService.findAll(user.businessId as string, query)

    return {
      data: serializeDtos(result.data, (expense) => ExpenseListItemDto.fromEntity(expense)!) as ExpenseListItem[],
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      totalAmount: result.totalAmount,
    }
  }

  @Get('summary/monthly')
  @RequireResource(Resource.EXPENSES_VIEW)
  @ApiOperation({ summary: 'Get monthly expense summary' })
  async getMonthlySummary(
    @CurrentUser() user: JwtPayload,
    @Query() query: MonthlyExpenseSummaryQueryDto,
  ): Promise<ExpenseMonthlySummary> {
    return serializeDto(
      ExpenseMonthlySummaryDto.fromEntity(
        await this.expensesService.getMonthlySummary(
          user.businessId as string,
          query.year,
          query.month,
        ),
      ),
    )
  }

  @Get('summary/range')
  @RequireResource(Resource.EXPENSES_VIEW)
  @ApiOperation({ summary: 'Get expense summary across a date range' })
  async getRangeSummary(
    @CurrentUser() user: JwtPayload,
    @Query() query: RangeExpenseSummaryQueryDto,
  ): Promise<ExpenseMonthlyRangeItem[] | ExpenseCategoryRangeItem[]> {
    const result = await this.expensesService.getRangeSummary(
      user.businessId as string,
      query.dateFrom,
      query.dateTo,
      query.groupBy ?? 'MONTH',
    )

    if ((query.groupBy ?? 'MONTH') === 'CATEGORY') {
      return serializeDtos(
        result as ExpenseCategoryRangeItem[],
        (item) => ExpenseCategoryRangeItemDto.fromModel(item),
      )
    }

    return serializeDtos(
      result as ExpenseMonthlyRangeItem[],
      (item) => ExpenseMonthlyRangeItemDto.fromModel(item),
    )
  }

  @Get('summary/pnl')
  @RequireResource(Resource.EXPENSES_VIEW)
  @ApiOperation({ summary: 'Get profit and loss summary for a month' })
  async getPnlSummary(
    @CurrentUser() user: JwtPayload,
    @Query() query: PnlSummaryQueryDto,
  ): Promise<ExpensePnlSummary> {
    return serializeDto(
      ExpensePnlSummaryDto.fromModel(
        await this.expensesService.getPnlSummary(
          user.businessId as string,
          query.year,
          query.month,
        ),
      ),
    )
  }

  @Get('summary')
  @RequireResource(Resource.EXPENSES_VIEW)
  @ApiOperation({ summary: 'Expense summary cards' })
  async getSummaryCard(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListExpensesQueryDto,
  ): Promise<ExpenseSummaryCard> {
    return this.expensesService.getSummaryCard(user.businessId as string, {
      categoryId: query.categoryId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    })
  }

  @Get('trend')
  @RequireResource(Resource.EXPENSES_VIEW)
  @ApiOperation({ summary: 'Expense monthly trend' })
  async getTrend(@CurrentUser() user: JwtPayload): Promise<ExpenseTrendItem[]> {
    return this.expensesService.getTrend(user.businessId as string)
  }

  @Get(':id')
  @RequireResource(Resource.EXPENSES_VIEW)
  @ApiOperation({ summary: 'Get expense detail' })
  async findById(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<Expense> {
    return serializeDto(
      ExpenseResponseDto.fromEntity(
        await this.expensesService.findById(id, user.businessId as string),
      )!,
    )
  }

  @Patch(':id')
  @RequireResource(Resource.EXPENSES_EDIT)
  @ApiOperation({ summary: 'Update an expense' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
  ): Promise<Expense> {
    return serializeDto(
      ExpenseResponseDto.fromEntity(
        await this.expensesService.update(id, user.businessId as string, user, dto),
      )!,
    )
  }

  @Delete(':id')
  @RequireResource(Resource.EXPENSES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an expense' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<void> {
    return this.expensesService.remove(id, user.businessId as string, user)
  }
}
