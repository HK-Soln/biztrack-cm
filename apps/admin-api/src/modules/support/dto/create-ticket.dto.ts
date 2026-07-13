import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator'
import { TicketCategory, TicketSeverity } from '@/entities/support-ticket.entity'

export class CreateTicketDto {
  @IsOptional()
  @IsUUID()
  businessId?: string

  @IsOptional()
  @IsUUID()
  userId?: string

  @IsString()
  @MinLength(3)
  @MaxLength(255)
  title!: string

  @IsString()
  @MinLength(3)
  description!: string

  @IsEnum(TicketCategory)
  category!: TicketCategory

  @IsEnum(TicketSeverity)
  severity!: TicketSeverity
}
