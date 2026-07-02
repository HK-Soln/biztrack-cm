import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { BusinessMemberRole, Resource, type AuditContext, type CashierPerformanceRow, type CashierShiftSummary, type DailySalesRow, type DailySalesSummary, type JwtPayload, type PaginatedResult, type RefundCashierRow, type RefundReasonRow, type Sale, type SaleListItem, type SaleReceipt, type SalesByPaymentRow, type SalesByProductRow } from '@biztrack/types'
import { serializeDto, serializePaginatedResult } from '@/common/http/serialization'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { CurrentAuditContext } from '@/modules/audit/decorators/audit-context.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { RequireResource, ResourceGuard } from '@/modules/permissions/guards/resource.guard'
import { CashierSummaryQueryDto } from '../dto/cashier-summary-query.dto'
import { CreateSaleDto } from '../dto/create-sale.dto'
import { DailySalesSummaryQueryDto } from '../dto/daily-sales-summary-query.dto'
import { ListSalesQueryDto } from '../dto/list-sales-query.dto'
import {
  CashierShiftSummaryDto,
  DailySalesSummaryDto,
  SaleListItemDto,
  SaleReceiptDto,
  SaleResponseDto,
} from '../dto/sale-response.dto'
import { VoidSaleDto } from '../dto/void-sale.dto'
import { SendSaleReceiptDto } from '../dto/send-sale-receipt.dto'
import { SalesService, type SalesSummary } from '../services/sales.service'

@ApiTags('Sales')
@ApiBearerAuth()
@UseGuards(Phase2Guard, ResourceGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequireResource(Resource.SALES_CREATE)
  @ApiOperation({ summary: 'Create a completed sale' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSaleDto,
    @CurrentAuditContext() auditContext: AuditContext,
  ): Promise<Sale> {
    return serializeDto(
      SaleResponseDto.fromEntity(
        await this.salesService.create(user.businessId as string, user, dto, auditContext),
      ),
    )
  }

  @Get()
  @RequireResource(Resource.SALES_VIEW)
  @ApiOperation({ summary: 'List sales' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListSalesQueryDto,
  ): Promise<PaginatedResult<SaleListItem>> {
    return serializePaginatedResult(
      await this.salesService.findAll(user.businessId as string, query),
      (sale) => SaleListItemDto.fromEntity(sale as never),
    )
  }

  @Get('summary/daily')
  @RequireResource(Resource.SALES_VIEW)
  @ApiOperation({ summary: 'Get daily sales summary' })
  async getDailySummary(
    @CurrentUser() user: JwtPayload,
    @Query() query: DailySalesSummaryQueryDto,
  ): Promise<DailySalesSummary> {
    return serializeDto(
      DailySalesSummaryDto.fromEntity(
        await this.salesService.getDailySummary(user.businessId as string, query.date),
      ),
    )
  }

  @Get('summary')
  @RequireResource(Resource.SALES_VIEW)
  @ApiOperation({ summary: 'Range sales summary' })
  async getRangeSummary(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListSalesQueryDto,
  ): Promise<SalesSummary> {
    return this.salesService.getRangeSummary(user.businessId as string, {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    })
  }

  @Get('summary/daily-series')
  @RequireResource(Resource.SALES_VIEW)
  @ApiOperation({ summary: 'Daily sales series (one row per day) for the Daily Sales report' })
  async getDailySeries(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListSalesQueryDto,
  ): Promise<DailySalesRow[]> {
    return this.salesService.getDailySeries(user.businessId as string, {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    })
  }

  @Get('cashier-roster')
  @RequireResource(Resource.SALES_VIEW)
  @ApiOperation({ summary: 'Cashier performance roster (one row per cashier) for the range' })
  async getCashierRoster(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListSalesQueryDto,
  ): Promise<CashierPerformanceRow[]> {
    return this.salesService.getCashierRoster(user.businessId as string, {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    })
  }

  @Get('by-product')
  @RequireResource(Resource.SALES_VIEW)
  @ApiOperation({ summary: 'Sales aggregated by product for the range' })
  async getSalesByProduct(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListSalesQueryDto,
  ): Promise<SalesByProductRow[]> {
    return this.salesService.getSalesByProduct(user.businessId as string, { dateFrom: query.dateFrom, dateTo: query.dateTo })
  }

  @Get('by-payment-method')
  @RequireResource(Resource.SALES_VIEW)
  @ApiOperation({ summary: 'Sales split by payment method for the range' })
  async getSalesByPaymentMethod(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListSalesQueryDto,
  ): Promise<SalesByPaymentRow[]> {
    return this.salesService.getSalesByPaymentMethod(user.businessId as string, { dateFrom: query.dateFrom, dateTo: query.dateTo })
  }

  @Get('refunds')
  @RequireResource(Resource.SALES_VIEW)
  @ApiOperation({ summary: 'Refunds & returns (by reason + by cashier) for the range' })
  async getRefundsSummary(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListSalesQueryDto,
  ): Promise<{ byReason: RefundReasonRow[]; byCashier: RefundCashierRow[]; grossSales: number }> {
    return this.salesService.getRefundsSummary(user.businessId as string, { dateFrom: query.dateFrom, dateTo: query.dateTo })
  }

  @Get('gross-profit')
  @RequireResource(Resource.SALES_VIEW)
  @ApiOperation({ summary: 'Product revenue + COGS for the range (feeds the income statement)' })
  async getGrossProfit(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListSalesQueryDto,
  ): Promise<{ revenue: number; cogs: number }> {
    return this.salesService.getGrossProfit(user.businessId as string, { dateFrom: query.dateFrom, dateTo: query.dateTo })
  }

  @Get('cashier-summary')
  @RequireResource(Resource.SALES_VIEW)
  @ApiOperation({ summary: 'Get cashier shift summary for a given date' })
  async getCashierShiftSummary(
    @CurrentUser() user: JwtPayload,
    @Query() query: CashierSummaryQueryDto,
  ): Promise<CashierShiftSummary> {
    const date = query.date ?? new Date().toISOString().slice(0, 10)
    const isCashierRole = [
      BusinessMemberRole.CASHIER,
      BusinessMemberRole.STAFF,
    ].includes(user.role as BusinessMemberRole)
    const cashierId = isCashierRole ? user.sub : (query.cashierId ?? user.sub)
    return serializeDto(
      CashierShiftSummaryDto.fromData(
        await this.salesService.getCashierShiftSummary(
          user.businessId as string,
          cashierId,
          date,
        ),
      ),
    )
  }

  @Get('by-number/:saleNumber')
  @RequireResource(Resource.SALES_VIEW)
  @ApiOperation({ summary: 'Get sale by human-readable sale number' })
  async findByNumber(
    @CurrentUser() user: JwtPayload,
    @Param('saleNumber') saleNumber: string,
  ): Promise<Sale> {
    return serializeDto(
      SaleResponseDto.fromEntity(
        await this.salesService.findByNumber(saleNumber, user.businessId as string),
      ),
    )
  }

  @Get(':id/receipt')
  @RequireResource(Resource.SALES_VIEW)
  @ApiOperation({ summary: 'Get structured receipt payload for a sale' })
  async getReceipt(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<SaleReceipt> {
    const payload = await this.salesService.getReceipt(id, user.businessId as string)
    return serializeDto(SaleReceiptDto.fromSale(payload.sale, payload.business))
  }

  @Post(':id/send')
  @RequireResource(Resource.SALES_VIEW)
  @ApiOperation({ summary: 'Render the receipt and dispatch it to the customer (WhatsApp/email)' })
  async sendReceipt(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SendSaleReceiptDto,
    @CurrentAuditContext() auditContext: AuditContext,
  ): Promise<{ pdfUrl: string }> {
    return this.salesService.sendReceipt(id, user.businessId as string, dto, auditContext)
  }

  @Post(':id/void')
  @RequireResource(Resource.SALES_VOID)
  @ApiOperation({ summary: 'Void a sale and reverse inventory' })
  async void(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: VoidSaleDto,
    @CurrentAuditContext() auditContext: AuditContext,
  ): Promise<Sale> {
    return serializeDto(
      SaleResponseDto.fromEntity(
        await this.salesService.void(id, user.businessId as string, user, dto, auditContext),
      ),
    )
  }

  @Get(':id')
  @RequireResource(Resource.SALES_VIEW)
  @ApiOperation({ summary: 'Get sale detail' })
  async findById(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<Sale> {
    return serializeDto(
      SaleResponseDto.fromEntity(
        await this.salesService.findById(id, user.businessId as string),
      ),
    )
  }
}
