import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { IsNull, Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import type { ChargeType as ChargeTypeModel, JwtPayload } from '@biztrack/types'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { ChargeType } from '@/entities/charge-type.entity'

/**
 * Active charge catalog for the business (system rows + own). Read-only — mirrors the
 * desktop ChargesService.listActive so the cloud build can offer charges at checkout.
 */
@ApiTags('charges')
@ApiBearerAuth()
@UseGuards(Phase2Guard)
@Controller('charges')
export class ChargesController {
  constructor(
    @InjectRepository(ChargeType)
    private readonly chargesRepo: Repository<ChargeType>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List active charge types (system + business)' })
  async listActive(@CurrentUser() user: JwtPayload): Promise<ChargeTypeModel[]> {
    const rows = await this.chargesRepo.find({
      where: [
        { isActive: true, businessId: IsNull() },
        { isActive: true, businessId: user.businessId as string },
      ],
      order: { isSystem: 'DESC', sortOrder: 'ASC', name: 'ASC' },
    })
    return rows.map((r) => ({
      id: r.id,
      businessId: r.businessId,
      name: r.name,
      description: r.description ?? null,
      rateType: r.rateType,
      defaultValue: r.defaultValue,
      isActive: r.isActive,
      isSystem: r.isSystem,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }))
  }
}
