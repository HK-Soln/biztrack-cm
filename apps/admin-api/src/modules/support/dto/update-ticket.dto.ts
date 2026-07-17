import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator'
import { TicketSeverity, TicketStatus } from '@/entities/support-ticket.entity'

export class UpdateTicketDto {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus

  @IsOptional()
  @IsEnum(TicketSeverity)
  severity?: TicketSeverity

  @IsOptional()
  @IsUUID()
  assignedTo?: string

  @IsOptional()
  @IsString()
  resolution?: string
}
