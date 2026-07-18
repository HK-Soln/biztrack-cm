import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator'
import { TicketCategory, TicketSeverity, TicketStatus } from '@/entities/support-ticket.entity'

export class TicketFiltersDto {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus

  @IsOptional()
  @IsEnum(TicketSeverity)
  severity?: TicketSeverity

  @IsOptional()
  @IsEnum(TicketCategory)
  category?: TicketCategory

  @IsOptional()
  @IsUUID()
  assignedTo?: string

  @IsOptional()
  @IsUUID()
  businessId?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
}
