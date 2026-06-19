import { Body, Controller, Get, Param, Post, Query, StreamableFile, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Resource } from '@biztrack/types'
import type { AuditContext, JwtPayload, PaginatedResult, PurchaseOrder, PurchaseOrderListItem } from '@biztrack/types'
import { serializeDto, serializePaginatedResult } from '@/common/http/serialization'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { CurrentAuditContext } from '@/modules/audit/decorators/audit-context.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { RequireResource, ResourceGuard } from '@/modules/permissions/guards/resource.guard'
import { ConvertRfqToPoDto } from '../dto/convert-rfq-to-po.dto'
import { CreatePurchaseOrderDto } from '../dto/create-purchase-order.dto'
import { ListPurchaseOrdersQueryDto } from '../dto/list-purchase-orders-query.dto'
import { SendPurchaseOrderDto } from '../dto/send-purchase-order.dto'
import { PurchaseOrderListItemResponseDto, PurchaseOrderResponseDto } from '../dto/purchase-order-response.dto'
import { PurchaseOrdersService } from '../services/purchase-orders.service'

@ApiTags('Purchase Orders')
@ApiBearerAuth()
@UseGuards(Phase2Guard, ResourceGuard)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseOrdersService) {}

  @Get()
  @RequireResource(Resource.INVENTORY_VIEW)
  @ApiOperation({ summary: 'List purchase orders' })
  async findAll(@CurrentUser() user: JwtPayload, @Query() query: ListPurchaseOrdersQueryDto): Promise<PaginatedResult<PurchaseOrderListItem>> {
    const result = await this.service.list(user.businessId as string, query)
    return serializePaginatedResult(result, (p) => PurchaseOrderListItemResponseDto.fromEntity(p)!)
  }

  @Get(':id')
  @RequireResource(Resource.INVENTORY_VIEW)
  @ApiOperation({ summary: 'Get a purchase order' })
  async findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<PurchaseOrder> {
    return serializeDto(PurchaseOrderResponseDto.fromEntity(await this.service.findById(id, user.businessId as string))!)
  }

  @Post()
  @RequireResource(Resource.INVENTORY_ADJUST)
  @ApiOperation({ summary: 'Create a purchase order' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentAuditContext() auditContext: AuditContext,
  ): Promise<PurchaseOrder> {
    return serializeDto(PurchaseOrderResponseDto.fromEntity(await this.service.create(user.businessId as string, dto, auditContext))!)
  }

  @Post('from-rfq/:rfqId')
  @RequireResource(Resource.INVENTORY_ADJUST)
  @ApiOperation({ summary: 'Create a purchase order from a chosen RFQ quote' })
  async createFromRfq(
    @CurrentUser() user: JwtPayload,
    @Param('rfqId') rfqId: string,
    @Body() dto: ConvertRfqToPoDto,
    @CurrentAuditContext() auditContext: AuditContext,
  ): Promise<PurchaseOrder> {
    return serializeDto(PurchaseOrderResponseDto.fromEntity(await this.service.createFromRfq(user.businessId as string, rfqId, dto, auditContext))!)
  }

  @Get(':id/document')
  @RequireResource(Resource.INVENTORY_VIEW)
  @ApiOperation({ summary: 'Render the PO PDF for download/share' })
  async document(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<StreamableFile> {
    const pdf = await this.service.getDocumentPdf(id, user.businessId as string)
    return new StreamableFile(pdf, { type: 'application/pdf' })
  }

  @Post(':id/send')
  @RequireResource(Resource.INVENTORY_ADJUST)
  @ApiOperation({ summary: 'Send the purchase order to the supplier (email/WhatsApp)' })
  async send(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SendPurchaseOrderDto,
    @CurrentAuditContext() auditContext: AuditContext,
  ): Promise<PurchaseOrder> {
    return serializeDto(PurchaseOrderResponseDto.fromEntity(await this.service.send(id, user.businessId as string, dto, auditContext))!)
  }

  @Post(':id/cancel')
  @RequireResource(Resource.INVENTORY_ADJUST)
  @ApiOperation({ summary: 'Cancel a purchase order' })
  async cancel(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @CurrentAuditContext() auditContext: AuditContext,
  ): Promise<PurchaseOrder> {
    return serializeDto(PurchaseOrderResponseDto.fromEntity(await this.service.cancel(id, user.businessId as string, auditContext))!)
  }
}
