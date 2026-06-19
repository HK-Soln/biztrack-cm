import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Resource } from '@biztrack/types'
import type { AuditContext, JwtPayload, PaginatedResult, Rfq, RfqListItem } from '@biztrack/types'
import { serializeDto, serializePaginatedResult } from '@/common/http/serialization'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { CurrentAuditContext } from '@/modules/audit/decorators/audit-context.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { RequireResource, ResourceGuard } from '@/modules/permissions/guards/resource.guard'
import { CreateRfqDto } from '../dto/create-rfq.dto'
import { ListRfqsQueryDto } from '../dto/list-rfqs-query.dto'
import { RecordRfqQuoteDto } from '../dto/record-rfq-quote.dto'
import { SendRfqDto } from '../dto/send-rfq.dto'
import { RfqListItemResponseDto, RfqResponseDto } from '../dto/rfq-response.dto'
import { RfqsService } from '../services/rfqs.service'

@ApiTags('RFQs')
@ApiBearerAuth()
@UseGuards(Phase2Guard, ResourceGuard)
@Controller('rfqs')
export class RfqsController {
  constructor(private readonly rfqsService: RfqsService) {}

  @Get()
  @RequireResource(Resource.INVENTORY_VIEW)
  @ApiOperation({ summary: 'List requests for quotation' })
  async findAll(@CurrentUser() user: JwtPayload, @Query() query: ListRfqsQueryDto): Promise<PaginatedResult<RfqListItem>> {
    const result = await this.rfqsService.list(user.businessId as string, query)
    return serializePaginatedResult(result, (r) => RfqListItemResponseDto.fromEntity(r)!)
  }

  @Get(':id')
  @RequireResource(Resource.INVENTORY_VIEW)
  @ApiOperation({ summary: 'Get a request for quotation' })
  async findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<Rfq> {
    return serializeDto(RfqResponseDto.fromEntity(await this.rfqsService.findById(id, user.businessId as string))!)
  }

  @Post()
  @RequireResource(Resource.INVENTORY_ADJUST)
  @ApiOperation({ summary: 'Create a request for quotation' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateRfqDto,
    @CurrentAuditContext() auditContext: AuditContext,
  ): Promise<Rfq> {
    return serializeDto(RfqResponseDto.fromEntity(await this.rfqsService.create(user.businessId as string, dto, auditContext))!)
  }

  @Post(':id/quotes')
  @RequireResource(Resource.INVENTORY_ADJUST)
  @ApiOperation({ summary: "Record a supplier's quote" })
  async recordQuote(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RecordRfqQuoteDto,
    @CurrentAuditContext() auditContext: AuditContext,
  ): Promise<Rfq> {
    return serializeDto(RfqResponseDto.fromEntity(await this.rfqsService.recordQuote(id, user.businessId as string, dto, auditContext))!)
  }

  @Post(':id/send')
  @RequireResource(Resource.INVENTORY_ADJUST)
  @ApiOperation({ summary: 'Send the RFQ to suppliers (email/WhatsApp)' })
  async send(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SendRfqDto,
    @CurrentAuditContext() auditContext: AuditContext,
  ): Promise<Rfq> {
    return serializeDto(RfqResponseDto.fromEntity(await this.rfqsService.send(id, user.businessId as string, dto, auditContext))!)
  }
}
